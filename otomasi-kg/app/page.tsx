import Link from 'next/link';

interface ToolCard {
  id: string;
  title: string;
  description: string;
  href: string;
  badge: string;
  icon: React.ReactNode;
}

export default function DeveloperPortalDashboard() {
  const tools: ToolCard[] = [
    {
      id: 'kg',
      title: 'Knowledge Graph Automation',
      description: 'Automated entity & relationship extraction pipeline, database management, and interactive graph visualization.',
      href: '/kg',
      badge: 'Knowledge Graph',
      icon: (
        <svg className="w-6 h-6 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <path d="M8.7 10.7l6.6-3.4" />
          <path d="M8.7 13.3l6.6 3.4" />
          <path d="M18 9v6" />
        </svg>
      ),
    },
    {
      id: 'secret',
      title: 'Secret Manager',
      description: 'AES-256-GCM encrypted vault service for managing API keys, bot tokens, DB credentials, and OAuth secrets across services.',
      href: '/secret',
      badge: 'Security Vault',
      icon: (
        <svg className="w-6 h-6 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    {
      id: 'coalachat',
      title: 'Coalachat',
      description: 'Intelligent personal AI conversational assistant designed for multi-turn reasoning, workflow automation, and daily productivity.',
      href: 'https://chat.kennethsunjaya.com',
      badge: 'AI Assistant',
      icon: (
        <svg className="w-6 h-6 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: 'phisang',
      title: 'Phisang',
      description: 'Pre-click URL structure & reputation evaluation pipeline using URLhaus threat intel, lexical scoring, and sandboxed MarkupLM classification.',
      href: 'https://phisang.kennethsunjaya.com',
      badge: 'Anti-Phishing',
      icon: (
        <svg className="w-6 h-6 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-zinc-200 py-4 px-6 sm:px-8 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-zinc-950"></div>
            <h1 className="text-base font-bold tracking-tight text-zinc-950">
              Developer Portal
            </h1>
          </div>
          <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 border border-zinc-200 px-2.5 py-0.5 rounded-full">
            v1.0.0
          </span>
        </div>
      </header>

      {/* Hero / Introduction */}
      <main className="max-w-6xl mx-auto px-6 sm:px-8 py-12 flex-1 w-full">
        <div className="mb-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight">
            Application Portal
          </h2>
          <p className="mt-2 text-sm sm:text-base text-zinc-500 max-w-3xl">
            Centralized hub for AI automation, secure credential distribution, and backend developer utilities.
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <Link
              key={tool.id}
              href={tool.href}
              target={tool.href.startsWith('http') ? '_blank' : undefined}
              rel={tool.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="group relative bg-white border border-zinc-200 hover:border-zinc-400 rounded-xl p-6 transition-all duration-200 shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-lg bg-zinc-100 group-hover:bg-zinc-200/70 transition-colors">
                    {tool.icon}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded">
                    {tool.badge}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-zinc-950 group-hover:text-black transition-colors flex items-center gap-2">
                  {tool.title}
                  <span className="opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1 duration-200 text-zinc-400 text-sm">
                    {tool.href.startsWith('http') ? '↗' : '→'}
                  </span>
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-zinc-500 leading-relaxed">
                  {tool.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-zinc-200 py-4 px-6 text-center text-xs text-zinc-400">
        © 2026 Kenneth Sunjaya. All rights reserved.
      </footer>
    </div>
  );
}
