/**
 * Root Application Component
 * Handles routing and global providers
 */
import { Navigate, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Component, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Toaster } from 'sonner';
import i18n from './i18n';
import { MainLayout } from './components/layout/MainLayout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Models } from './pages/Models';
import { Chat } from './pages/Chat';
import { Agents } from './pages/Agents';
import { Channels } from './pages/Channels';
import { Skills } from './pages/Skills';
import { Cron } from './pages/Cron';
import { Dreams } from './pages/Dreams';
import { ImageGenerationPage } from './pages/ImageGeneration';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';
import { useSettingsStore } from './stores/settings';
import { useUpdateStore } from './stores/update';
import { useGatewayStore } from './stores/gateway';
import { useProviderStore } from './stores/providers';
import { rendererExtensionRegistry } from './extensions/registry';
import { loadExternalRendererExtensions } from './extensions/_ext-bridge.generated';
import { UpdateNotifier } from './components/update/UpdateNotifier';
import { useNewChatAction } from './components/layout/use-new-chat-action';
import { hostEvents } from './lib/host-events';
import { useCwwAuthStore } from './stores/cww-auth';
import { QRCodeLogin } from './components/cww/QRCodeLogin';
import { TitleBar } from './components/layout/TitleBar';


/**
 * Error Boundary to catch and display React rendering errors
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React Error Boundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          color: '#f87171',
          background: '#0f172a',
          minHeight: '100vh',
          fontFamily: 'monospace'
        }}>
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Something went wrong</h1>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            background: '#1e293b',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const skipSetupForE2E = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('e2eSkipSetup') === '1';
  const initSettings = useSettingsStore((state) => state.init);
  const theme = useSettingsStore((state) => state.theme);
  const language = useSettingsStore((state) => state.language);
  const setupComplete = useSettingsStore((state) => state.setupComplete);
  const devModeUnlocked = useSettingsStore((state) => state.devModeUnlocked);
  const initGateway = useGatewayStore((state) => state.init);
  const initUpdate = useUpdateStore((state) => state.init);
  const initProviders = useProviderStore((state) => state.init);
  const handleNewChat = useNewChatAction();
  const cwwLoggedIn = useCwwAuthStore((state) => state.loggedIn);
  const cwwInitializing = useCwwAuthStore((state) => state.initializing);
  const cwwRestore = useCwwAuthStore((state) => state.restore);

  /** 是否需要 CWW 登录（配置了 API 但未登录） */
  const needCwwLogin = !cwwInitializing && !cwwLoggedIn;

  useEffect(() => {
    let cancelled = false;

    void initSettings().finally(() => {
      if (!cancelled) {
        void initUpdate();
      }
    });

    // 冷启动恢复 CWW 登录态
    cwwRestore();

    return () => {
      cancelled = true;
    };
  }, [initSettings, initUpdate, cwwRestore]);

  // Sync i18n language with persisted settings on mount
  useEffect(() => {
    if (language && language !== i18n.language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  // Initialize Gateway connection on mount
  useEffect(() => {
    initGateway();
  }, [initGateway]);

  // Initialize provider snapshot on mount
  useEffect(() => {
    initProviders();
  }, [initProviders]);

  // Listen for navigation events from main process
  useEffect(() => {
    const unsubscribe = hostEvents.onNavigate((path) => {
      navigate(path);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [navigate]);

  useEffect(() => {
    const unsubscribe = hostEvents.onNewChat(handleNewChat);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [handleNewChat]);

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  // Load external renderer extensions (generated by scripts/generate-ext-bridge.mjs)
  // and initialize all registered extensions.
  useEffect(() => {
    loadExternalRendererExtensions();
    void rendererExtensionRegistry.initializeAll();
    return () => rendererExtensionRegistry.teardownAll();
  }, []);

  const extraRoutes = rendererExtensionRegistry.getExtraRoutes();

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        {/* 必须登录才能使用，未登录始终显示扫码登录 */}
        {!cwwInitializing && !cwwLoggedIn ? (
          <div className="flex flex-col h-screen bg-background">
            {/* 登录页标题栏：提供窗口拖动和关闭/最小化/最大化按钮 */}
            <TitleBar />
            <div className="flex items-center justify-center flex-1">
              <QRCodeLogin />
            </div>
          </div>
        ) : setupComplete || skipSetupForE2E ? (
        <Routes>
          {/* Setup wizard (shown on first launch) */}
          <Route path="/setup/*" element={<Setup />} />

          {/* Main application routes */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Chat />} />
            <Route path="/models" element={<Models />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/cron" element={<Cron />} />
            <Route path="/image-generation" element={devModeUnlocked ? <ImageGenerationPage /> : <Navigate to="/" replace />} />
            <Route path="/dreams" element={devModeUnlocked ? <Dreams /> : <Navigate to="/" replace />} />
            <Route path="/settings/*" element={<Settings />} />
            {extraRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={<r.component />} />
            ))}
          </Route>
        </Routes>
        ) : (
        <Routes>
          <Route path="/setup/*" element={<Setup />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
        )}

        <UpdateNotifier />

        {/* Global toast notifications */}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          theme={theme}
          style={{ zIndex: 99999 }}
        />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
