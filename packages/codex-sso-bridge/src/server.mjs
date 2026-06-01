#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 14550;
export const DEFAULT_TIMEOUT_MS = 180000;
export const DEFAULT_MODEL = 'codex-cli-default';

const TOKEN_HEADER = 'x-oc-axis-bridge-token';
const MAX_BODY_BYTES = 1024 * 1024;
const WINDOWS_CODEX_NAMES = ['codex.exe', 'codex.ps1', 'codex.cmd', 'codex.bat', 'codex'];

function getHomeDir(env = process.env) {
  return env.USERPROFILE || env.HOME || os.homedir();
}

export function getDefaultConfigPath(env = process.env) {
  return path.join(getHomeDir(env), '.oc-axis', 'codex-bridge.json');
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function safeTokenEquals(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function responseHeaders() {
  return {
    'Access-Control-Allow-Headers': 'Content-Type, X-OC-Axis-Bridge-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };
}

function splitPathEntries(env = process.env) {
  return String(env.PATH || env.Path || '')
    .split(path.delimiter)
    .map(entry => entry.trim())
    .filter(Boolean);
}

function findCommandOnPath(commandNames, env = process.env) {
  const pathEntries = splitPathEntries(env);
  if (env.APPDATA) {
    pathEntries.push(path.join(env.APPDATA, 'npm'));
  }

  for (const pathEntry of pathEntries) {
    for (const commandName of commandNames) {
      const candidate = path.join(pathEntry, commandName);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function toPowershellCommand(scriptPath) {
  return {
    argsPrefix: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    command: 'powershell.exe',
  };
}

function toCmdCommand(scriptPath) {
  return {
    argsPrefix: ['/d', '/s', '/c', scriptPath],
    command: 'cmd.exe',
  };
}

function toNodeCommand(scriptPath, env = process.env) {
  return {
    argsPrefix: [scriptPath],
    command: env.NODE || process.execPath,
  };
}

function getNpmCodexEntrypoint(commandPath) {
  const commandDir = path.dirname(commandPath);
  const candidate = path.join(commandDir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  return existsSync(candidate) ? candidate : undefined;
}

function normalizeCodexCommand(commandPath, env = process.env) {
  const normalizedCommandPath = String(commandPath || '').trim();
  if (!normalizedCommandPath) {
    return {
      argsPrefix: [],
      command: 'codex',
    };
  }

  const extension = path.extname(normalizedCommandPath).toLowerCase();
  const npmEntrypoint = getNpmCodexEntrypoint(normalizedCommandPath);
  if (npmEntrypoint) {
    return toNodeCommand(npmEntrypoint, env);
  }

  if (extension === '.cmd' || extension === '.bat') {
    return toCmdCommand(normalizedCommandPath);
  }

  if (extension === '.ps1') {
    return toPowershellCommand(normalizedCommandPath);
  }

  if (extension === '.js') {
    return toNodeCommand(normalizedCommandPath, env);
  }

  return {
    argsPrefix: [],
    command: normalizedCommandPath,
  };
}

export function resolveCodexInvocation(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const explicitPath = env.CODEX_CLI_PATH || env.CODEX_PATH;

  if (explicitPath) {
    return normalizeCodexCommand(explicitPath, env);
  }

  if (platform === 'win32') {
    const commandPath = findCommandOnPath(WINDOWS_CODEX_NAMES, env);
    if (commandPath) {
      return normalizeCodexCommand(commandPath, env);
    }
  }

  return {
    argsPrefix: [],
    command: 'codex',
  };
}

function formatSpawnError(command, error) {
  if (error?.code !== 'ENOENT' && error?.code !== 'EINVAL') {
    return error instanceof Error ? error.message : String(error);
  }

  return [
    `Could not start Codex CLI command "${command}" (${error.code}).`,
    'Make sure Codex CLI is installed and available in the terminal PATH used to start this bridge.',
    'On Windows, you can also start the bridge with CODEX_CLI_PATH set to the full codex.exe, codex.cmd, codex.ps1, or codex.js path.',
  ].join(' ');
}

function writeJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    ...responseHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Request body is too large');
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

export async function runCommand(command, args, options = {}) {
  const {
    cwd,
    env,
    input,
    spawnCommand = spawn,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  return new Promise(resolve => {
    const child = spawnCommand(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const finish = result => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        signal: null,
        stderr,
        stdout,
        timedOut,
        ...result,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      if (typeof child.kill === 'function') {
        child.kill('SIGKILL');
      }
    }, timeoutMs);

    child.stdout?.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', error => {
      finish({
        error,
        stderr: stderr || formatSpawnError(command, error),
      });
    });

    child.on('close', (exitCode, signal) => {
      finish({
        exitCode: exitCode ?? -1,
        signal,
      });
    });

    if (child.stdin && typeof child.stdin.end === 'function') {
      child.stdin.end(input ?? '');
    }
  });
}

function runCodexCommand(options, args, runOptions = {}) {
  return runCommand(options.codexCommand, [...options.codexArgsPrefix, ...args], runOptions);
}

export async function loadOrCreateBridgeConfig(options = {}) {
  const configPath = options.configPath || getDefaultConfigPath(options.env);
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);

  if (existsSync(configPath)) {
    const stored = JSON.parse(await readFile(configPath, 'utf8'));
    return {
      configPath,
      host: stored.host || host,
      port: Number(stored.port || port),
      token: stored.token || randomBytes(32).toString('hex'),
    };
  }

  const config = {
    host,
    port,
    token: randomBytes(32).toString('hex'),
  };

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return {
    configPath,
    ...config,
  };
}

function textFromContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(item => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      if (typeof item.text === 'string') {
        return item.text;
      }

      if (typeof item.image_url === 'string') {
        return `[image input: ${item.image_url}]`;
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export function buildCodexPrompt(requestBody) {
  const lines = [
    'You are acting as the model backend for Oracle AXIS.',
    'Return only the assistant message content required by the conversation. Do not add extra commentary.',
  ];

  if (typeof requestBody.instructions === 'string' && requestBody.instructions.trim()) {
    lines.push('', '<instructions>', requestBody.instructions.trim(), '</instructions>');
  }

  lines.push('', '<conversation>');

  for (const message of requestBody.input || []) {
    const role = typeof message.role === 'string' ? message.role : 'user';
    const content = textFromContent(message.content).trim();
    if (content) {
      lines.push(`${role.toUpperCase()}:`, content, '');
    }
  }

  lines.push('</conversation>');

  return lines.join('\n');
}

function extractOutputTextFromJsonl(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const event = JSON.parse(lines[index]);
      const candidate =
        event.message ||
        event.content ||
        event.text ||
        event.output_text ||
        event.payload?.message ||
        event.payload?.content ||
        event.payload?.text;
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    } catch {
      // Ignore non-JSON log lines.
    }
  }

  return stdout.trim();
}

async function readFinalMessage(outputFile, stdout) {
  try {
    const outputText = (await readFile(outputFile, 'utf8')).trim();
    if (outputText) {
      return outputText;
    }
  } catch {
    // Fall back to JSONL stdout below.
  }

  return extractOutputTextFromJsonl(stdout);
}

async function handleHealth(res, options) {
  const version = await runCodexCommand(options, ['--version'], {
    spawnCommand: options.spawnCommand,
    timeoutMs: options.healthTimeoutMs,
  });
  const login = await runCodexCommand(options, ['login', 'status'], {
    spawnCommand: options.spawnCommand,
    timeoutMs: options.healthTimeoutMs,
  });

  writeJson(res, 200, {
    ok: version.exitCode === 0,
    version: (version.stdout || version.stderr).trim(),
    login: {
      loggedIn: login.exitCode === 0,
      output: (login.stdout || login.stderr).trim(),
    },
  });
}

async function handleResponses(req, res, options) {
  const body = await readJsonBody(req);
  if (!Array.isArray(body.input)) {
    writeJson(res, 400, {
      error: {
        message: 'Request body must include an input array',
      },
    });
    return;
  }

  await mkdir(options.workDir, { recursive: true });

  const outputFile = path.join(
    os.tmpdir(),
    `oc-axis-codex-bridge-${Date.now()}-${randomBytes(6).toString('hex')}.txt`,
  );

  const args = [
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    '--ignore-rules',
    '--sandbox',
    'read-only',
    '--cd',
    options.workDir,
    '--json',
    '--output-last-message',
    outputFile,
  ];

  if (body.model && body.model !== DEFAULT_MODEL) {
    args.push('--model', String(body.model));
  }

  args.push('-');

  const result = await runCodexCommand(options, args, {
    input: buildCodexPrompt(body),
    spawnCommand: options.spawnCommand,
    timeoutMs: options.timeoutMs,
  });

  if (result.timedOut) {
    writeJson(res, 504, {
      error: {
        message: `Codex bridge timed out after ${options.timeoutMs}ms`,
      },
    });
    return;
  }

  if (result.exitCode !== 0) {
    writeJson(res, 502, {
      error: {
        message: (result.stderr || result.stdout || 'Codex CLI exited without output').trim(),
      },
    });
    return;
  }

  const outputText = await readFinalMessage(outputFile, result.stdout);
  await unlink(outputFile).catch(() => undefined);

  writeJson(res, 200, {
    output_text: outputText,
  });
}

export function createBridgeServer(options = {}) {
  const codexInvocation =
    options.codexInvocation ||
    (options.codexCommand
      ? { argsPrefix: options.codexArgsPrefix || [], command: options.codexCommand }
      : resolveCodexInvocation({ env: options.env }));
  const bridgeOptions = {
    codexArgsPrefix: codexInvocation.argsPrefix || [],
    codexCommand: codexInvocation.command,
    healthTimeoutMs: options.healthTimeoutMs || 10000,
    spawnCommand: options.spawnCommand || spawn,
    timeoutMs: Number(options.timeoutMs || process.env.CODEX_BRIDGE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    token: options.token,
    workDir: options.workDir || path.join(os.tmpdir(), 'oc-axis-codex-bridge-workdir'),
  };

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, responseHeaders());
        res.end();
        return;
      }

      if (!safeTokenEquals(req.headers[TOKEN_HEADER], bridgeOptions.token)) {
        writeJson(res, 401, {
          error: {
            message: 'Missing or invalid bridge token',
          },
        });
        return;
      }

      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/health') {
        await handleHealth(res, bridgeOptions);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/responses') {
        await handleResponses(req, res, bridgeOptions);
        return;
      }

      writeJson(res, 404, {
        error: {
          message: 'Not found',
        },
      });
    } catch (error) {
      writeJson(res, 500, {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}

export async function startBridgeServer(options = {}) {
  const config = await loadOrCreateBridgeConfig(options);
  const server = createBridgeServer({
    ...options,
    token: config.token,
  });

  await new Promise(resolve => {
    server.listen(config.port, config.host, resolve);
  });

  return {
    ...config,
    server,
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const port = Number(process.env.CODEX_BRIDGE_PORT || DEFAULT_PORT);
  const codexInvocation = resolveCodexInvocation();
  const { configPath, host, server, token } = await startBridgeServer({ codexInvocation, port });
  const address = server.address();
  const effectivePort = typeof address === 'object' && address ? address.port : port;

  console.log(`OC AXIS Codex SSO bridge listening on http://${host}:${effectivePort}`);
  console.log(`Config: ${configPath}`);
  console.log(`Codex CLI: ${[codexInvocation.command, ...codexInvocation.argsPrefix].join(' ') || 'codex'}`);
  console.log(`Bridge token: ${token}`);
}
