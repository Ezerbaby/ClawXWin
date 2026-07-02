/**
 * 登录状态徽章组件
 * 显示当前用户的头像和昵称，点击可退出登录
 * 适用于侧边栏/标题栏等内联场景
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCwwAuthStore } from '@/stores/cww-auth';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function LoginStatusBadge() {
  const { t } = useTranslation(['cww', 'common']);
  const loggedIn = useCwwAuthStore((s) => s.loggedIn);
  const user = useCwwAuthStore((s) => s.user);
  const logout = useCwwAuthStore((s) => s.logout);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // 未登录时不渲染
  if (!loggedIn || !user) return null;

  const nickname = user.nickname ?? String(user.id);

  // 确认退出登录
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // 退出登录失败静默处理，store 状态不变
    } finally {
      setLoggingOut(false);
      setLogoutDialogOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="cww-login-badge"
        onClick={() => setLogoutDialogOpen(true)}
        title={t('cww:auth.loggedIn', { nickname })}
        className={cn(
          'flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5',
          'transition-colors text-foreground/80',
          'hover:bg-black/5 dark:hover:bg-white/5',
        )}
      >
        {/* 头像圆圈 */}
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={nickname}
            className="h-6 w-6 shrink-0 rounded-full object-cover"
            draggable={false}
          />
        ) : (
          <div
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
              'bg-primary/10 text-primary',
            )}
          >
            <User className="h-3.5 w-3.5" />
          </div>
        )}

        {/* 昵称文本 */}
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
          {nickname}
        </span>

        {/* 退出图标 */}
        <LogOut className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {/* 退出登录确认对话框 */}
      <ConfirmDialog
        open={logoutDialogOpen}
        title={t('common:actions.confirm')}
        message={t('cww:auth.logout')}
        confirmLabel={t('cww:auth.logout')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        onConfirm={handleLogout}
        onCancel={() => setLogoutDialogOpen(false)}
      />
    </>
  );
}
