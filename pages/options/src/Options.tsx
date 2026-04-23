import { useState, useEffect } from 'react';
import '@src/Options.css';
import { Button } from '@extension/ui';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { t } from '@extension/i18n';
import { FiSettings, FiCpu, FiShield, FiHelpCircle } from 'react-icons/fi';
import { GeneralSettings } from './components/GeneralSettings';
import { ModelSettings } from './components/ModelSettings';
import { FirewallSettings } from './components/FirewallSettings';
type TabTypes = 'general' | 'models' | 'firewall' | 'help';

const TABS: { id: TabTypes; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'general', icon: FiSettings, label: t('options_tabs_general') },
  { id: 'models', icon: FiCpu, label: t('options_tabs_models') },
  { id: 'firewall', icon: FiShield, label: t('options_tabs_firewall') },
  { id: 'help', icon: FiHelpCircle, label: t('options_tabs_help') },
];

const Options = () => {
  const [activeTab, setActiveTab] = useState<TabTypes>('models');
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(darkModeMediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    darkModeMediaQuery.addEventListener('change', handleChange);
    return () => darkModeMediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleTabClick = (tabId: TabTypes) => {
    if (tabId === 'help') {
      window.open('https://oracle.com/axis/docs', '_blank');
    } else {
      setActiveTab(tabId);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings isDarkMode={isDarkMode} />;
      case 'models':
        return <ModelSettings isDarkMode={isDarkMode} />;
      case 'firewall':
        return <FirewallSettings isDarkMode={isDarkMode} />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`flex min-h-screen min-w-[768px] ${isDarkMode ? 'bg-[#2D2B29] text-[#D4CFC9]' : 'bg-[#F8F7F3] text-[#2D2B29]'}`}>
      {/* Vertical Navigation Bar — Ebony sidebar */}
      <nav
        className={`w-52 shrink-0 border-r ${isDarkMode ? 'border-[#4A4644] bg-[#3A3836]' : 'border-[#E0DDD5] bg-white'}`}>
        <div className="p-5">
          {/* Oracle logomark + title */}
          <div className="mb-6 flex items-center gap-2.5">
            <img src="/oracle-logo.svg" alt="Oracle" className="h-5 w-8" />
            <h1 className={`text-sm font-semibold uppercase tracking-widest ${isDarkMode ? 'text-[#C4BFBA]' : 'text-[#2D2B29]'}`}>
              {t('options_nav_header')}
            </h1>
          </div>
          <ul className="space-y-1">
            {TABS.map(item => (
              <li key={item.id}>
                <Button
                  onClick={() => handleTabClick(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm font-medium transition-colors
                    ${
                      activeTab === item.id
                        ? 'bg-[#C74634] text-white shadow-sm'
                        : isDarkMode
                          ? 'text-[#C4BFBA] hover:bg-[#4A4644] hover:text-white'
                          : 'text-[#2D2B29] hover:bg-[#F8F7F3] hover:text-[#C74634]'
                    }`}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className={`flex-1 overflow-y-auto p-8 ${isDarkMode ? 'bg-[#2D2B29]' : 'bg-[#F8F7F3]'}`}>
        <div className="mx-auto min-w-[512px] max-w-screen-lg">{renderTabContent()}</div>
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <div>Loading...</div>), <div>Error Occurred</div>);
