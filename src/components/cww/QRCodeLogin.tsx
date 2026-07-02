/**
 * 二维码扫码登录组件
 * 展示鲁南千易扫码登录的完整流程：
 * loading -> waiting (显示二维码) -> scanned (等待确认) -> success / expired (点击刷新) / error
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QrCode, RefreshCw, Smartphone, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCwwAuthStore } from '@/stores/cww-auth';

export function QRCodeLogin() {
  const { t } = useTranslation('cww');
  const qrState = useCwwAuthStore((s) => s.qrState);
  const qrImg = useCwwAuthStore((s) => s.qrImg);
  const error = useCwwAuthStore((s) => s.error);
  const fetchQRCode = useCwwAuthStore((s) => s.fetchQRCode);
  const stopPolling = useCwwAuthStore((s) => s.stopPolling);
  const reset = useCwwAuthStore((s) => s.reset);

  // 挂载时自动获取二维码，卸载时停止轮询并重置状态
  useEffect(() => {
    void fetchQRCode();
    return () => {
      stopPolling();
      reset();
    };
  }, [fetchQRCode, stopPolling, reset]);

  // 点击刷新二维码
  const handleRefresh = () => {
    void fetchQRCode();
  };

  return (
    <div className="flex items-center justify-center w-full h-full min-h-[400px]">
      <div
        className={cn(
          'flex flex-col items-center gap-6 w-full max-w-sm',
          'rounded-xl border bg-surface-modal p-8 shadow-lg',
        )}
      >
        {/* 标题区域 */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <QrCode className="h-8 w-8 text-primary" />
          <h2 className="font-serif font-normal tracking-tight text-xl text-foreground">
            {t('auth.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('auth.subtitle')}
          </p>
        </div>

        {/* 二维码展示区域 */}
        <div
          className={cn(
            'relative flex items-center justify-center',
            'w-56 h-56 rounded-lg border bg-surface-input',
          )}
        >
          {/* 加载中状态 */}
          {qrState === 'loading' && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <span className="text-sm">{t('auth.loading')}</span>
            </div>
          )}

          {/* 等待扫码状态：显示二维码图片 */}
          {qrState === 'waiting' && qrImg && (
            <img
              src={qrImg}
              alt="QR Code"
              className="h-full w-full object-contain rounded-lg"
              draggable={false}
            />
          )}

          {/* 已扫码，等待确认 */}
          {qrState === 'scanned' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/5 dark:bg-white/10 backdrop-blur-[2px]">
              <Smartphone className="h-10 w-10 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                {t('auth.scanned')}
              </span>
            </div>
          )}

          {/* 二维码过期：点击刷新 */}
          {qrState === 'expired' && (
            <button
              type="button"
              onClick={handleRefresh}
              className={cn(
                'absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg',
                'bg-black/5 dark:bg-white/10 backdrop-blur-[2px]',
                'cursor-pointer transition-colors',
                'hover:bg-black/10 dark:hover:bg-white/15',
              )}
            >
              <RefreshCw className="h-10 w-10 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                {t('auth.expired')}
              </span>
            </button>
          )}

          {/* 获取二维码失败 */}
          {qrState === 'error' && (
            <button
              type="button"
              onClick={handleRefresh}
              className={cn(
                'absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg',
                'bg-black/5 dark:bg-white/10 backdrop-blur-[2px]',
                'cursor-pointer transition-colors',
                'hover:bg-black/10 dark:hover:bg-white/15',
              )}
            >
              <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
              <span className="text-sm font-medium text-red-700 dark:text-red-400">
                {t('auth.error')}
              </span>
              {error && (
                <span className="text-xs text-red-600 dark:text-red-500 max-w-[180px] text-center">
                  {error}
                </span>
              )}
            </button>
          )}
        </div>

        {/* 底部提示 */}
        <p className="text-xs text-muted-foreground text-center">
          {qrState === 'waiting'
            ? t('auth.subtitle')
            : qrState === 'scanned'
              ? t('auth.scanned')
              : qrState === 'expired'
                ? t('auth.expired')
                : ''}
        </p>
      </div>
    </div>
  );
}
