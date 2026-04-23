import React, { useState, useEffect } from 'react';
import { analyticsSettingsStore } from '@extension/storage';

import type { AnalyticsSettingsConfig } from '@extension/storage';

interface AnalyticsSettingsProps {
  isDarkMode: boolean;
}

const card = (isDarkMode: boolean) =>
  `rounded border ${isDarkMode ? 'border-[#4A4644] bg-[#3A3836]' : 'border-[#E0DDD5] bg-white'} p-6 text-left shadow-sm`;

const heading = (isDarkMode: boolean) =>
  `mb-4 text-xl font-semibold ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`;

export const AnalyticsSettings: React.FC<AnalyticsSettingsProps> = ({ isDarkMode }) => {
  const [settings, setSettings] = useState<AnalyticsSettingsConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = await analyticsSettingsStore.getSettings();
        setSettings(currentSettings);
      } catch (error) {
        console.error('Failed to load analytics settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();

    const unsubscribe = analyticsSettingsStore.subscribe(loadSettings);
    return () => { unsubscribe(); };
  }, []);

  const handleToggleAnalytics = async (enabled: boolean) => {
    if (!settings) return;
    try {
      await analyticsSettingsStore.updateSettings({ enabled });
      setSettings({ ...settings, enabled });
    } catch (error) {
      console.error('Failed to update analytics settings:', error);
    }
  };

  if (loading) {
    return (
      <section className="space-y-6">
        <div className={card(isDarkMode)}>
          <h2 className={heading(isDarkMode)}>Analytics Settings</h2>
          <div className="animate-pulse">
            <div className={`mb-2 h-4 w-3/4 rounded ${isDarkMode ? 'bg-[#4A4644]' : 'bg-[#E0DDD5]'}`} />
            <div className={`h-4 w-1/2 rounded ${isDarkMode ? 'bg-[#4A4644]' : 'bg-[#E0DDD5]'}`} />
          </div>
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="space-y-6">
        <div className={card(isDarkMode)}>
          <h2 className={heading(isDarkMode)}>Analytics Settings</h2>
          <p className="text-red-500">Failed to load analytics settings.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className={card(isDarkMode)}>
        <h2 className={heading(isDarkMode)}>Analytics Settings</h2>

        <div className="space-y-6">
          {/* Main toggle */}
          <div className={`rounded border p-4 ${isDarkMode ? 'border-[#4A4644] bg-[#2D2B29]' : 'border-[#E0DDD5] bg-[#F8F7F3]'}`}>
            <div className="flex items-center justify-between">
              <label
                htmlFor="analytics-enabled"
                className={`text-sm font-medium ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
                Help improve Oracle AXIS
              </label>
              <div className="relative inline-block w-12 select-none">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={e => handleToggleAnalytics(e.target.checked)}
                  className="sr-only"
                  id="analytics-enabled"
                />
                <label
                  htmlFor="analytics-enabled"
                  className={`block h-6 cursor-pointer overflow-hidden rounded-full ${
                    settings.enabled ? 'bg-[#C74634]' : isDarkMode ? 'bg-[#4A4644]' : 'bg-[#E0DDD5]'
                  }`}>
                  <span className="sr-only">Toggle analytics</span>
                  <span
                    className={`block size-6 rounded-full bg-white shadow transition-transform ${
                      settings.enabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </label>
              </div>
            </div>
            <p className={`mt-2 text-sm ${isDarkMode ? 'text-[#6B6460]' : 'text-[#6B6460]'}`}>
              Share anonymous usage data to help us improve the extension
            </p>
          </div>

          {/* What we collect */}
          <div className={`rounded border p-4 ${isDarkMode ? 'border-[#4A4644] bg-[#2D2B29]' : 'border-[#E0DDD5] bg-[#F8F7F3]'}`}>
            <h3 className={`mb-4 text-sm font-semibold ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
              What we collect:
            </h3>
            <ul className={`list-disc space-y-2 pl-5 text-left text-sm ${isDarkMode ? 'text-[#C4BFBA]' : 'text-[#6B6460]'}`}>
              <li>Task execution metrics (start, completion, failure counts and duration)</li>
              <li>Domain names of websites visited (e.g., &quot;amazon.com&quot;, not full URLs)</li>
              <li>Error categories for failed tasks (no sensitive details)</li>
              <li>Anonymous usage statistics</li>
            </ul>

            <h3 className={`mb-4 mt-6 text-sm font-semibold ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
              What we DON&apos;T collect:
            </h3>
            <ul className={`list-disc space-y-2 pl-5 text-left text-sm ${isDarkMode ? 'text-[#C4BFBA]' : 'text-[#6B6460]'}`}>
              <li>Personal information or login credentials</li>
              <li>Full URLs or page content</li>
              <li>Task instructions or user prompts</li>
              <li>Screen recordings or screenshots</li>
              <li>Any sensitive or private data</li>
            </ul>
          </div>

          {/* Opt-out notice */}
          {!settings.enabled && (
            <div className={`rounded border p-4 ${isDarkMode ? 'border-[#C74634]/30 bg-[#C74634]/10' : 'border-[#C74634]/20 bg-[#FFF5F3]'}`}>
              <p className={`text-sm ${isDarkMode ? 'text-[#E5654F]' : 'text-[#C74634]'}`}>
                Analytics disabled. You can re-enable it anytime to help improve Oracle AXIS.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
