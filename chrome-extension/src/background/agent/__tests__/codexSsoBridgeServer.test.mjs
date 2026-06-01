import { EventEmitter } from 'node:events';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBridgeServer,
  resolveCodexInvocation,
  runCommand,
} from '../../../../../packages/codex-sso-bridge/src/server.mjs';

const servers = [];

function createMockSpawn(routes) {
  return vi.fn((command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn(() => {
      child.emit('close', null, 'SIGKILL');
    });
    child.stdin = {
      end(input) {
        const route = routes.find(candidate => candidate.match(command, args, input));
        if (!route || route.neverClose) {
          return;
        }

        setTimeout(async () => {
          if (route.outputFileText) {
            const outputFileIndex = args.indexOf('--output-last-message') + 1;
            await writeFile(args[outputFileIndex], route.outputFileText, 'utf8');
          }
          if (route.stdout) {
            child.stdout.emit('data', route.stdout);
          }
          if (route.stderr) {
            child.stderr.emit('data', route.stderr);
          }
          child.emit('close', route.exitCode ?? 0, null);
        }, 0);
      },
    };
    return child;
  });
}

async function listen(server) {
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected server address');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  return {
    body: await response.json(),
    response,
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise(resolve => {
          server.close(resolve);
        }),
    ),
  );
  vi.restoreAllMocks();
});

describe('codex sso bridge server', () => {
  it('wraps Windows cmd Codex shims through cmd.exe', () => {
    const invocation = resolveCodexInvocation({
      env: {
        CODEX_CLI_PATH: 'C:\\Users\\Example\\AppData\\Roaming\\npm\\codex.cmd',
      },
      platform: 'win32',
    });

    expect(invocation).toEqual({
      argsPrefix: ['/d', '/s', '/c', 'C:\\Users\\Example\\AppData\\Roaming\\npm\\codex.cmd'],
      command: 'cmd.exe',
    });
  });

  it('wraps Windows PowerShell Codex shims from CODEX_CLI_PATH', () => {
    const invocation = resolveCodexInvocation({
      env: {
        CODEX_CLI_PATH: 'C:\\Users\\Example\\AppData\\Roaming\\npm\\codex.ps1',
      },
      platform: 'win32',
    });

    expect(invocation).toEqual({
      argsPrefix: [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        'C:\\Users\\Example\\AppData\\Roaming\\npm\\codex.ps1',
      ],
      command: 'powershell.exe',
    });
  });

  it('returns an actionable message when Codex cannot be spawned', async () => {
    const spawnCommand = vi.fn(() => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = {
        end() {
          setTimeout(() => {
            const error = new Error('spawn codex ENOENT');
            error.code = 'ENOENT';
            child.emit('error', error);
          }, 0);
        },
      };
      return child;
    });

    const result = await runCommand('codex', ['--version'], {
      spawnCommand,
      timeoutMs: 100,
    });

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toMatch(/Could not start Codex CLI command "codex"/);
    expect(result.stderr).toMatch(/CODEX_CLI_PATH/);
  });

  it('reports Codex version and logged-in status', async () => {
    const spawnCommand = createMockSpawn([
      {
        match: (_command, args) => args.join(' ') === '--version',
        stdout: 'codex-cli 0.131.0\n',
      },
      {
        match: (_command, args) => args.join(' ') === 'login status',
        stdout: 'Logged in with ChatGPT\n',
      },
    ]);
    const server = createBridgeServer({ codexCommand: 'codex', spawnCommand, token: 'secret' });
    const baseUrl = await listen(server);

    const { body, response } = await fetchJson(`${baseUrl}/health`, {
      headers: { 'X-OC-Axis-Bridge-Token': 'secret' },
    });

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      version: 'codex-cli 0.131.0',
      login: {
        loggedIn: true,
        output: 'Logged in with ChatGPT',
      },
    });
  });

  it('reports not-logged-in status without failing health', async () => {
    const spawnCommand = createMockSpawn([
      {
        match: (_command, args) => args.join(' ') === '--version',
        stdout: 'codex-cli 0.131.0\n',
      },
      {
        exitCode: 1,
        match: (_command, args) => args.join(' ') === 'login status',
        stdout: 'Not logged in\n',
      },
    ]);
    const server = createBridgeServer({ codexCommand: 'codex', spawnCommand, token: 'secret' });
    const baseUrl = await listen(server);

    const { body, response } = await fetchJson(`${baseUrl}/health`, {
      headers: { 'X-OC-Axis-Bridge-Token': 'secret' },
    });

    expect(response.status).toBe(200);
    expect(body.login).toMatchObject({
      loggedIn: false,
      output: 'Not logged in',
    });
  });

  it('rejects requests with a bad bridge token', async () => {
    const server = createBridgeServer({ codexCommand: 'codex', spawnCommand: createMockSpawn([]), token: 'secret' });
    const baseUrl = await listen(server);

    const { body, response } = await fetchJson(`${baseUrl}/health`, {
      headers: { 'X-OC-Axis-Bridge-Token': 'wrong' },
    });

    expect(response.status).toBe(401);
    expect(body.error.message).toMatch(/invalid bridge token/i);
  });

  it('runs codex exec and returns the final output message', async () => {
    const workDir = path.join(os.tmpdir(), `oc-axis-bridge-test-${Date.now()}`);
    await mkdir(workDir, { recursive: true });
    const spawnCommand = createMockSpawn([
      {
        match: (_command, args, input) =>
          args.includes('exec') &&
          args.includes('--skip-git-repo-check') &&
          args.includes('--ephemeral') &&
          args.includes('--ignore-rules') &&
          args.includes('--sandbox') &&
          args.includes('read-only') &&
          args.includes('--json') &&
          args.at(-1) === '-' &&
          input.includes('Return only the assistant message content'),
        outputFileText: '{"done":true}',
      },
    ]);
    const server = createBridgeServer({ codexCommand: 'codex', spawnCommand, token: 'secret', workDir });
    const baseUrl = await listen(server);

    const { body, response } = await fetchJson(`${baseUrl}/responses`, {
      body: JSON.stringify({
        input: [{ role: 'user', content: 'Return JSON' }],
        model: 'codex-cli-default',
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-OC-Axis-Bridge-Token': 'secret',
      },
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ output_text: '{"done":true}' });
    expect(spawnCommand.mock.calls[0][1]).not.toContain('--model');

    await rm(workDir, { force: true, recursive: true });
  });

  it('returns a timeout response when Codex does not finish', async () => {
    const spawnCommand = createMockSpawn([
      {
        match: (_command, args) => args.includes('exec'),
        neverClose: true,
      },
    ]);
    const server = createBridgeServer({ codexCommand: 'codex', spawnCommand, timeoutMs: 5, token: 'secret' });
    const baseUrl = await listen(server);

    const { body, response } = await fetchJson(`${baseUrl}/responses`, {
      body: JSON.stringify({
        input: [{ role: 'user', content: 'Return JSON' }],
        model: 'codex-cli-default',
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-OC-Axis-Bridge-Token': 'secret',
      },
      method: 'POST',
    });

    expect(response.status).toBe(504);
    expect(body.error.message).toMatch(/timed out/i);
  });
});
