import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import AISettings from '../AiSettings';

const Layout = () => {
    const [showSettings, setShowSettings] = useState(false);

    return (
        <div className="flex min-h-screen bg-dark-950 text-white selection:bg-primary-500/30">
            <Navbar onOpenSettings={() => setShowSettings(true)} />
            <main className="flex-1 ml-20 md:ml-64 p-4 md:p-8 animate-fade-in overflow-x-hidden">
                <div className="max-w-7xl mx-auto min-h-[calc(100vh-4rem)]">
                    <Outlet context={{ openSettings: () => setShowSettings(true) }} />
                </div>
            </main>

            <AISettings isOpen={showSettings} onClose={() => setShowSettings(false)} />

            {/* Background decoration elements */}
            <div className="fixed top-[-10%] left-[-5%] w-[40%] h-[40%] bg-primary-600/10 blur-[120px] rounded-full -z-10 pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-secondary-600/10 blur-[100px] rounded-full -z-10 pointer-events-none" />
        </div>
    );
};

export default Layout;
