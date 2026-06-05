interface DomReplayAccuracyFailure {
  stepIndex: number;
  actionIndex: number;
  actionName: string | null;
  status: string;
  reason: string;
}

interface DomReplayAccuracyTargetResult {
  stepIndex: number;
  actionIndex: number;
  actionName: string | null;
  originalIndex: number | null;
  currentIndex: number | null;
  status: string;
  matchCount: number;
  reason: string;
  historicalUrl: string | null;
  historicalTitle: string | null;
}

export interface DomReplayAccuracyReportData {
  totalTargets: number;
  matchedTargets: number;
  failedTargets: number;
  ambiguousTargets: number;
  indexChangedButRecovered: number;
  accuracyPercent: number;
  failures: DomReplayAccuracyFailure[];
  results: DomReplayAccuracyTargetResult[];
}

interface DomReplayAccuracyReportProps {
  report: DomReplayAccuracyReportData | null;
  error: string | null;
  isLoading: boolean;
  sessionTitle: string;
  onBack: () => void;
  isDarkMode?: boolean;
}

const PASS_THRESHOLD = 90;

const statusLabel: Record<string, string> = {
  matched: 'Matched',
  matched_with_new_index: 'Recovered index',
  not_found: 'Not found',
  ambiguous_match: 'Ambiguous',
  wrong_page: 'Wrong page',
  unsupported_target: 'Unsupported',
};

const statusClass = (status: string, isDarkMode: boolean) => {
  if (status === 'matched' || status === 'matched_with_new_index') {
    return isDarkMode ? 'bg-[#133D2E] text-[#86EFAC]' : 'bg-[#E8F7EF] text-[#087443]';
  }
  if (status === 'ambiguous_match') {
    return isDarkMode ? 'bg-[#3F3214] text-[#FACC15]' : 'bg-[#FFF8DB] text-[#8A6100]';
  }
  return isDarkMode ? 'bg-[#4A1F1A] text-[#FCA5A5]' : 'bg-[#FCEBE8] text-[#9E3929]';
};

const Metric = ({
  label,
  value,
  isDarkMode,
}: {
  label: string;
  value: string | number;
  isDarkMode: boolean;
}) => (
  <div className={`rounded border p-3 ${isDarkMode ? 'border-ebony-muted bg-ebony-light' : 'border-warm-border bg-white'}`}>
    <div className={`text-[11px] uppercase tracking-widest ${isDarkMode ? 'text-[#8C8580]' : 'text-[#8A827A]'}`}>
      {label}
    </div>
    <div className={`mt-1 text-xl font-semibold ${isDarkMode ? 'text-[#F5F2ED]' : 'text-ebony'}`}>{value}</div>
  </div>
);

const DomReplayAccuracyReport = ({
  report,
  error,
  isLoading,
  sessionTitle,
  onBack,
  isDarkMode = false,
}: DomReplayAccuracyReportProps) => {
  const passed = report ? report.totalTargets > 0 && report.accuracyPercent >= PASS_THRESHOLD && report.ambiguousTargets === 0 : false;
  const visibleResults = report?.results.slice(0, 25) ?? [];

  return (
    <div className={`h-full overflow-y-auto p-4 ${isDarkMode ? 'text-[#D4CFC9]' : 'text-ebony'}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest">DOM Accuracy Report</h2>
          <p className={`mt-1 text-xs ${isDarkMode ? 'text-[#8C8580]' : 'text-[#8A827A]'}`}>{sessionTitle}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className={`rounded border px-3 py-1.5 text-xs font-medium ${
            isDarkMode
              ? 'border-ebony-muted text-[#D4CFC9] hover:bg-ebony-light'
              : 'border-warm-border text-ebony hover:bg-canvas'
          }`}>
          Back
        </button>
      </div>

      {isLoading && (
        <div
          className={`rounded border p-4 text-sm ${isDarkMode ? 'border-ebony-muted bg-ebony-light' : 'border-warm-border bg-white'}`}>
          Checking saved DOM references against the current page...
        </div>
      )}

      {!isLoading && error && (
        <div
          className={`rounded border p-4 text-sm ${
            isDarkMode ? 'border-[#7F2A1D] bg-[#4A1F1A] text-[#FCA5A5]' : 'border-[#F2B8AE] bg-[#FCEBE8] text-oracle-red-dark'
          }`}>
          {error}
        </div>
      )}

      {!isLoading && report && (
        <div className="space-y-4">
          <div
            className={`rounded border p-4 ${
              passed
                ? isDarkMode
                  ? 'border-[#246B4A] bg-[#133D2E]'
                  : 'border-[#A8E6C1] bg-[#E8F7EF]'
                : isDarkMode
                  ? 'border-[#7F2A1D] bg-[#4A1F1A]'
                  : 'border-[#F2B8AE] bg-[#FCEBE8]'
            }`}>
            <div className={`text-sm font-semibold ${passed ? (isDarkMode ? 'text-[#86EFAC]' : 'text-[#087443]') : isDarkMode ? 'text-[#FCA5A5]' : 'text-oracle-red-dark'}`}>
              {passed ? 'Ready for script validation' : 'Needs review before script validation'}
            </div>
            <p className={`mt-1 text-xs ${passed ? (isDarkMode ? 'text-[#B7F7CF]' : 'text-[#087443]') : isDarkMode ? 'text-[#FECACA]' : 'text-oracle-red-dark'}`}>
              Target threshold is {PASS_THRESHOLD}% with no ambiguous matches.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="Accuracy" value={`${report.accuracyPercent}%`} isDarkMode={isDarkMode} />
            <Metric label="Targets" value={report.totalTargets} isDarkMode={isDarkMode} />
            <Metric label="Matched" value={report.matchedTargets} isDarkMode={isDarkMode} />
            <Metric label="Recovered" value={report.indexChangedButRecovered} isDarkMode={isDarkMode} />
            <Metric label="Failed" value={report.failedTargets} isDarkMode={isDarkMode} />
            <Metric label="Ambiguous" value={report.ambiguousTargets} isDarkMode={isDarkMode} />
          </div>

          {report.totalTargets === 0 && (
            <div
              className={`rounded border p-4 text-sm ${
                isDarkMode ? 'border-ebony-muted bg-ebony-light text-[#8C8580]' : 'border-warm-border bg-white text-[#8A827A]'
              }`}>
              No saved DOM interaction targets were found for this history session.
            </div>
          )}

          {report.failures.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest">Failures</h3>
              <div className="space-y-2">
                {report.failures.map(failure => (
                  <div
                    key={`${failure.stepIndex}-${failure.actionIndex}-${failure.status}`}
                    className={`rounded border p-3 text-xs ${
                      isDarkMode ? 'border-ebony-muted bg-ebony-light' : 'border-warm-border bg-white'
                    }`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        Step {failure.stepIndex + 1}, action {failure.actionIndex + 1}
                      </span>
                      <span className={`rounded px-2 py-0.5 ${statusClass(failure.status, isDarkMode)}`}>
                        {statusLabel[failure.status] ?? failure.status}
                      </span>
                    </div>
                    <div className={`mt-1 ${isDarkMode ? 'text-[#8C8580]' : 'text-[#8A827A]'}`}>
                      {failure.actionName ?? 'Unknown action'}: {failure.reason}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {visibleResults.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest">Target Results</h3>
              <div className="space-y-2">
                {visibleResults.map(result => (
                  <div
                    key={`${result.stepIndex}-${result.actionIndex}-${result.status}-${result.currentIndex ?? 'none'}`}
                    className={`rounded border p-3 text-xs ${
                      isDarkMode ? 'border-ebony-muted bg-ebony-light' : 'border-warm-border bg-white'
                    }`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        Step {result.stepIndex + 1}, action {result.actionIndex + 1}
                      </span>
                      <span className={`rounded px-2 py-0.5 ${statusClass(result.status, isDarkMode)}`}>
                        {statusLabel[result.status] ?? result.status}
                      </span>
                    </div>
                    <div className={`mt-1 ${isDarkMode ? 'text-[#8C8580]' : 'text-[#8A827A]'}`}>
                      {result.actionName ?? 'Unknown action'} | saved index {result.originalIndex ?? 'none'} | current index{' '}
                      {result.currentIndex ?? 'none'}
                    </div>
                    <div className={`mt-1 ${isDarkMode ? 'text-[#8C8580]' : 'text-[#8A827A]'}`}>{result.reason}</div>
                  </div>
                ))}
              </div>
              {report.results.length > visibleResults.length && (
                <p className={`mt-2 text-xs ${isDarkMode ? 'text-[#8C8580]' : 'text-[#8A827A]'}`}>
                  Showing first {visibleResults.length} of {report.results.length} target results.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default DomReplayAccuracyReport;
