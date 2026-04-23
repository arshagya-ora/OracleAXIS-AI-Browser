interface HelpSettingsProps {
  isDarkMode?: boolean;
}

const HELP_CONTACTS = {
  emails: [
    'arshagya.s.shrivastava@oracle.com',
    'anshit.gupta@oracle.com',
    'sakshi.rastogi@oracle.com',
    'rahul.r.shukla@oracle.com',
  ],
  slackUrl: 'https://oracle.enterprise.slack.com/archives/C0AT9ET713Q',
};

export const HelpSettings = ({ isDarkMode = false }: HelpSettingsProps) => {
  return (
    <section className="space-y-6">
      <div
        className={`rounded border ${isDarkMode ? 'border-[#4A4644] bg-[#3A3836]' : 'border-[#E0DDD5] bg-white'} p-6 text-left shadow-sm`}>
        <h2 className={`mb-4 text-left text-xl font-semibold ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
          Help
        </h2>
        <p className={`max-w-3xl text-sm leading-7 ${isDarkMode ? 'text-[#C4BFBA]' : 'text-[#6B6460]'}`}>
          Oracle AXIS is an AI-powered Chrome extension for browser automation. It helps users run web-based tasks
          through natural-language instructions, allowing the system to navigate websites, extract information, fill
          forms, and complete multi-step browser workflows directly on live webpages.
        </p>
        <div className="space-y-3">
          <p className={`text-sm leading-7 ${isDarkMode ? 'text-[#C4BFBA]' : 'text-[#6B6460]'}`}>
            The extension uses a planner and navigator model setup to break user goals into actionable steps and execute
            them in the browser. From the Settings page, users can manage General configuration, choose supported model
            providers, define Firewall restrictions, review Analytics settings, and access this Help section for product
            guidance and support contacts.
          </p>
          <p className={`text-sm leading-7 ${isDarkMode ? 'text-[#C4BFBA]' : 'text-[#6B6460]'}`}>
            In the current UI, the Models section focuses on supported providers only: OpenAI, Gemini, Ollama, and
            Grok. The page is intended to keep setup simple, focused, and aligned with the currently exposed extension
            features.
          </p>
        </div>
      </div>

      <div
        className={`rounded border ${isDarkMode ? 'border-[#4A4644] bg-[#3A3836]' : 'border-[#E0DDD5] bg-white'} p-6 text-left shadow-sm`}>
        <h3 className={`mb-4 text-lg font-semibold ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
          Contact
        </h3>

        <p className={`mb-4 text-sm font-medium ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
          For any queries contact these emails:
        </p>

        <div className="space-y-3">
          {HELP_CONTACTS.emails.map(email => (
            <a
              key={email}
              href={`mailto:${email}`}
              className={`block text-sm font-medium ${isDarkMode ? 'text-[#F28B7B]' : 'text-[#C74634]'} hover:underline`}>
              {email}
            </a>
          ))}
        </div>

        <div className="mt-6">
          <h4 className={`mb-2 text-sm font-semibold ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
            Slack Channel
          </h4>
          <a
            href={HELP_CONTACTS.slackUrl}
            target="_blank"
            rel="noreferrer"
            className={`text-sm font-medium ${isDarkMode ? 'text-[#F28B7B]' : 'text-[#C74634]'} hover:underline`}>
            {HELP_CONTACTS.slackUrl}
          </a>
        </div>
      </div>
    </section>
  );
};
