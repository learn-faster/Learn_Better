import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Settings from '../Settings';
import FloatingTimer from '../FloatingTimer';
import CosmicDoodleBackground from '../ui/CosmicDoodleBackground';
import AgentDock from '../GoalAgent/AgentDock';
import GlobalProgressHUD from '../common/GlobalProgressHUD';
import PageShell from '../ui/page-shell';

const Layout = () => {
    const [showSettings, setShowSettings] = useState(false);
    const location = useLocation();
    const isDocumentViewer = location.pathname.startsWith('/documents/');

    return (
        <div className="relative flex min-h-screen bg-dark-950 text-white selection:bg-primary-500/30 overflow-x-hidden">
            <CosmicDoodleBackground />

            {!isDocumentViewer && <Navbar onOpenSettings={() => setShowSettings(true)} />}
            <main className={`relative z-10 flex-1 transition-all duration-300 ${isDocumentViewer ? 'ml-0 p-0' : 'ml-24 md:ml-72 p-4 md:p-8'} animate-fade-in`}>
                <div className={`${isDocumentViewer ? 'w-full min-h-screen' : 'max-w-7xl mx-auto min-h-[calc(100vh-4rem)]'}`}>
                    {isDocumentViewer ? (
                        <Outlet context={{ openSettings: () => setShowSettings(true) }} />
                    ) : (
                        <PageShell>
                            <Outlet context={{ openSettings: () => setShowSettings(true) }} />
                        </PageShell>
                    )}
                </div>
            </main>

            {!isDocumentViewer && <FloatingTimer />}
            {!isDocumentViewer && <GlobalProgressHUD />}
            {!isDocumentViewer && <AgentDock />}
            <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
        </div>
    );
};

export default Layout;
