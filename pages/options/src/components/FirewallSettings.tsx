import { useState, useEffect, useCallback } from 'react';
import { firewallStore } from '@extension/storage';
import { Button } from '@extension/ui';
import { t } from '@extension/i18n';

interface FirewallSettingsProps {
  isDarkMode: boolean;
}

const card = (isDarkMode: boolean) =>
  `rounded border ${isDarkMode ? 'border-[#4A4644] bg-[#3A3836]' : 'border-[#E0DDD5] bg-white'} p-6 text-left shadow-sm`;

export const FirewallSettings = ({ isDarkMode }: FirewallSettingsProps) => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [allowList, setAllowList] = useState<string[]>([]);
  const [denyList, setDenyList] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [activeList, setActiveList] = useState<'allow' | 'deny'>('allow');

  const loadFirewallSettings = useCallback(async () => {
    const settings = await firewallStore.getFirewall();
    setIsEnabled(settings.enabled);
    setAllowList(settings.allowList);
    setDenyList(settings.denyList);
  }, []);

  useEffect(() => { loadFirewallSettings(); }, [loadFirewallSettings]);

  const handleToggleFirewall = async () => {
    await firewallStore.updateFirewall({ enabled: !isEnabled });
    await loadFirewallSettings();
  };

  const handleAddUrl = async () => {
    const cleanUrl = newUrl.trim().replace(/^https?:\/\//, '');
    if (!cleanUrl) return;
    if (activeList === 'allow') {
      await firewallStore.addToAllowList(cleanUrl);
    } else {
      await firewallStore.addToDenyList(cleanUrl);
    }
    await loadFirewallSettings();
    setNewUrl('');
  };

  const handleRemoveUrl = async (url: string, listType: 'allow' | 'deny') => {
    if (listType === 'allow') {
      await firewallStore.removeFromAllowList(url);
    } else {
      await firewallStore.removeFromDenyList(url);
    }
    await loadFirewallSettings();
  };

  const tabBtn = (id: 'allow' | 'deny', label: string) => (
    <Button
      onClick={() => setActiveList(id)}
      className={`px-4 py-1.5 text-sm font-medium ${
        activeList === id
          ? 'bg-[#C74634] text-white'
          : isDarkMode
            ? 'bg-[#4A4644] text-[#C4BFBA] hover:text-white'
            : 'bg-[#F8F7F3] text-[#2D2B29] border border-[#E0DDD5] hover:border-[#C74634] hover:text-[#C74634]'
      }`}>
      {label}
    </Button>
  );

  const currentList = activeList === 'allow' ? allowList : denyList;
  const emptyMsg = activeList === 'allow'
    ? t('options_firewall_allowList_empty')
    : t('options_firewall_denyList_empty');

  return (
    <section className="space-y-6">
      <div className={card(isDarkMode)}>
        <h2 className={`mb-5 text-xl font-semibold ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
          {t('options_firewall_header')}
        </h2>

        <div className="space-y-5">
          {/* Enable toggle */}
          <div className={`rounded border p-4 ${isDarkMode ? 'border-[#4A4644] bg-[#2D2B29]' : 'border-[#E0DDD5] bg-[#F8F7F3]'}`}>
            <div className="flex items-center justify-between">
              <label htmlFor="toggle-firewall"
                className={`text-sm font-medium ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
                {t('options_firewall_enableToggle')}
              </label>
              <div className="relative inline-block w-12 select-none">
                <input type="checkbox" checked={isEnabled} onChange={handleToggleFirewall}
                  className="sr-only" id="toggle-firewall" />
                <label htmlFor="toggle-firewall"
                  className={`block h-6 cursor-pointer overflow-hidden rounded-full ${
                    isEnabled ? 'bg-[#C74634]' : isDarkMode ? 'bg-[#4A4644]' : 'bg-[#E0DDD5]'
                  }`}>
                  <span className="sr-only">{t('options_firewall_toggleFirewall_a11y')}</span>
                  <span className={`block size-6 rounded-full bg-white shadow transition-transform ${
                    isEnabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </label>
              </div>
            </div>
          </div>

          {/* List tabs */}
          <div className="flex gap-2">
            {tabBtn('allow', t('options_firewall_allowList_header'))}
            {tabBtn('deny', t('options_firewall_denyList_header'))}
          </div>

          {/* URL input + Add button */}
          <div className="flex gap-2">
            <input
              id="url-input"
              type="text"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddUrl(); }}
              placeholder={t('options_firewall_placeholders_domainUrl')}
              className={`flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:border-[#C74634] focus:ring-2 focus:ring-[#C74634]/20 ${
                isDarkMode
                  ? 'border-[#4A4644] bg-[#3A3836] text-[#D4CFC9] placeholder:text-[#6B6460]'
                  : 'border-[#E0DDD5] bg-white text-[#2D2B29] placeholder:text-[#A09A94]'
              }`}
            />
            <Button onClick={handleAddUrl} className="bg-[#C74634] px-4 py-2 text-sm text-white hover:bg-[#9E3929]">
              {t('options_firewall_btnAdd')}
            </Button>
          </div>

          {/* List items */}
          <div className="max-h-64 overflow-y-auto">
            {currentList.length > 0 ? (
              <ul className="space-y-2">
                {currentList.map(url => (
                  <li key={url}
                    className={`flex items-center justify-between rounded border px-3 py-2 ${
                      isDarkMode ? 'border-[#4A4644] bg-[#2D2B29]' : 'border-[#E0DDD5] bg-[#F8F7F3]'
                    }`}>
                    <span className={`text-sm ${isDarkMode ? 'text-[#C4BFBA]' : 'text-[#2D2B29]'}`}>{url}</span>
                    <Button
                      variant="danger"
                      onClick={() => handleRemoveUrl(url, activeList)}
                      className="px-2 py-1 text-xs">
                      {t('options_firewall_btnRemove')}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`text-center text-sm ${isDarkMode ? 'text-[#6B6460]' : 'text-[#A09A94]'}`}>
                {emptyMsg}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className={card(isDarkMode)}>
        <h2 className={`mb-4 text-xl font-semibold ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
          {t('options_firewall_howItWorks_header')}
        </h2>
        <ul className={`list-disc space-y-2 pl-5 text-left text-sm ${isDarkMode ? 'text-[#C4BFBA]' : 'text-[#6B6460]'}`}>
          {t('options_firewall_howItWorks').split('\n').map((rule, index) => (
            <li key={index}>{rule}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};
