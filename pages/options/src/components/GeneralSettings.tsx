import { useState, useEffect } from 'react';
import { type GeneralSettingsConfig, generalSettingsStore, DEFAULT_GENERAL_SETTINGS } from '@extension/storage';
import { t } from '@extension/i18n';

interface GeneralSettingsProps {
  isDarkMode?: boolean;
}

const inputCls = (isDarkMode: boolean) =>
  `w-20 rounded border px-3 py-2 text-sm focus:outline-none focus:border-[#C74634] focus:ring-2 focus:ring-[#C74634]/20 ${
    isDarkMode
      ? 'border-[#4A4644] bg-[#3A3836] text-[#D4CFC9]'
      : 'border-[#E0DDD5] bg-white text-[#2D2B29]'
  }`;

const toggleCls = (isDarkMode: boolean) =>
  `peer h-6 w-11 rounded-full ${isDarkMode ? 'bg-[#4A4644]' : 'bg-[#E0DDD5]'} after:absolute after:left-[2px] after:top-[2px] after:size-5 after:rounded-full after:border after:border-[#E0DDD5] after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#C74634] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#C74634]/20`;

export const GeneralSettings = ({ isDarkMode = false }: GeneralSettingsProps) => {
  const [settings, setSettings] = useState<GeneralSettingsConfig>(DEFAULT_GENERAL_SETTINGS);

  useEffect(() => {
    generalSettingsStore.getSettings().then(setSettings);
  }, []);

  const updateSetting = async <K extends keyof GeneralSettingsConfig>(key: K, value: GeneralSettingsConfig[K]) => {
    setSettings(prevSettings => ({ ...prevSettings, [key]: value }));
    await generalSettingsStore.updateSettings({ [key]: value } as Partial<GeneralSettingsConfig>);
    const latestSettings = await generalSettingsStore.getSettings();
    setSettings(latestSettings);
  };

  const rowLabel = (title: string, desc: string) => (
    <div>
      <h3 className={`text-sm font-medium ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>{title}</h3>
      <p className={`text-xs font-normal ${isDarkMode ? 'text-[#6B6460]' : 'text-[#A09A94]'}`}>{desc}</p>
    </div>
  );

  return (
    <section className="space-y-6">
      <div
        className={`rounded border ${isDarkMode ? 'border-[#4A4644] bg-[#3A3836]' : 'border-[#E0DDD5] bg-white'} p-6 text-left shadow-sm`}>
        <h2 className={`mb-5 text-left text-xl font-semibold ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
          {t('options_general_header')}
        </h2>

        <div className="divide-y divide-[#E0DDD5]">
          {isDarkMode && <style>{`.divide-y > * + * { border-color: #4A4644; }`}</style>}

          <div className="flex items-center justify-between py-4">
            {rowLabel(t('options_general_maxSteps'), t('options_general_maxSteps_desc'))}
            <input id="maxSteps" type="number" min={1} max={50} value={settings.maxSteps}
              onChange={e => updateSetting('maxSteps', Number.parseInt(e.target.value, 10))}
              className={inputCls(isDarkMode)} />
          </div>

          <div className="flex items-center justify-between py-4">
            {rowLabel(t('options_general_maxActions'), t('options_general_maxActions_desc'))}
            <input id="maxActionsPerStep" type="number" min={1} max={50} value={settings.maxActionsPerStep}
              onChange={e => updateSetting('maxActionsPerStep', Number.parseInt(e.target.value, 10))}
              className={inputCls(isDarkMode)} />
          </div>

          <div className="flex items-center justify-between py-4">
            {rowLabel(t('options_general_maxFailures'), t('options_general_maxFailures_desc'))}
            <input id="maxFailures" type="number" min={1} max={10} value={settings.maxFailures}
              onChange={e => updateSetting('maxFailures', Number.parseInt(e.target.value, 10))}
              className={inputCls(isDarkMode)} />
          </div>

          <div className="flex items-center justify-between py-4">
            {rowLabel(t('options_general_enableVision'), t('options_general_enableVision_desc'))}
            <div className="relative inline-flex cursor-pointer items-center">
              <input id="useVision" type="checkbox" checked={settings.useVision}
                onChange={e => updateSetting('useVision', e.target.checked)} className="peer sr-only" />
              <label htmlFor="useVision" className={toggleCls(isDarkMode)}>
                <span className="sr-only">{t('options_general_enableVision')}</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between py-4">
            {rowLabel(t('options_general_displayHighlights'), t('options_general_displayHighlights_desc'))}
            <div className="relative inline-flex cursor-pointer items-center">
              <input id="displayHighlights" type="checkbox" checked={settings.displayHighlights}
                onChange={e => updateSetting('displayHighlights', e.target.checked)} className="peer sr-only" />
              <label htmlFor="displayHighlights" className={toggleCls(isDarkMode)}>
                <span className="sr-only">{t('options_general_displayHighlights')}</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between py-4">
            {rowLabel(t('options_general_planningInterval'), t('options_general_planningInterval_desc'))}
            <input id="planningInterval" type="number" min={1} max={20} value={settings.planningInterval}
              onChange={e => updateSetting('planningInterval', Number.parseInt(e.target.value, 10))}
              className={inputCls(isDarkMode)} />
          </div>

          <div className="flex items-center justify-between py-4">
            {rowLabel(t('options_general_minWaitPageLoad'), t('options_general_minWaitPageLoad_desc'))}
            <input id="minWaitPageLoad" type="number" min={250} max={5000} step={50} value={settings.minWaitPageLoad}
              onChange={e => updateSetting('minWaitPageLoad', Number.parseInt(e.target.value, 10))}
              className={inputCls(isDarkMode)} />
          </div>

          <div className="flex items-center justify-between py-4">
            {rowLabel(t('options_general_replayHistoricalTasks'), t('options_general_replayHistoricalTasks_desc'))}
            <div className="relative inline-flex cursor-pointer items-center">
              <input id="replayHistoricalTasks" type="checkbox" checked={settings.replayHistoricalTasks}
                onChange={e => updateSetting('replayHistoricalTasks', e.target.checked)} className="peer sr-only" />
              <label htmlFor="replayHistoricalTasks" className={toggleCls(isDarkMode)}>
                <span className="sr-only">{t('options_general_replayHistoricalTasks')}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
