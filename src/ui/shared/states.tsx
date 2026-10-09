/**
 * Async state components. Every data region in OpenMusic must render exactly one
 * of loading / empty / error / success (product spec §8), so these are shared.
 */

import type { ReactNode } from '@lynx-js/react';

import { useTheme } from './theme.js';
import { Pressable, Skeleton, Text } from './primitives.js';
import type { AppError } from '../../domain/errors.js';

export interface EmptyStateProps {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({ title, hint, actionLabel, onAction, compact = false }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <view
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: compact ? `${theme.spacing.x6}px` : `${theme.spacing.x8}px`,
        paddingBottom: compact ? `${theme.spacing.x6}px` : `${theme.spacing.x8}px`,
        paddingLeft: `${theme.spacing.x6}px`,
        paddingRight: `${theme.spacing.x6}px`,
        gap: `${theme.spacing.x2}px`,
      }}
    >
      <Text variant="section" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {hint ? (
        <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
          {hint}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          onPress={onAction}
          id="empty-state-action"
          style={{
            marginTop: `${theme.spacing.x4}px`,
            paddingLeft: `${theme.spacing.x6}px`,
            paddingRight: `${theme.spacing.x6}px`,
            height: 44,
            borderRadius: `${theme.radius.pill}px`,
            backgroundColor: theme.colors.brand,
          }}
        >
          <Text variant="body" color="inverse" weight="medium">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </view>
  );
}

export interface ErrorStateProps {
  error: AppError | { userMessage: string; kind: string };
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({ error, onRetry, compact = false }: ErrorStateProps) {
  const theme = useTheme();
  return (
    <view
      style={{
        alignItems: 'center',
        paddingTop: compact ? `${theme.spacing.x6}px` : `${theme.spacing.x8}px`,
        paddingBottom: compact ? `${theme.spacing.x6}px` : `${theme.spacing.x8}px`,
        paddingLeft: `${theme.spacing.x6}px`,
        paddingRight: `${theme.spacing.x6}px`,
        gap: `${theme.spacing.x2}px`,
      }}
    >
      <Text variant="body" color="error" style={{ textAlign: 'center' }}>
        {error.userMessage}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityLabel="重试"
          onPress={onRetry}
          id="error-state-retry"
          style={{
            marginTop: `${theme.spacing.x3}px`,
            paddingLeft: `${20}px`,
            paddingRight: `${20}px`,
            height: 44,
            borderRadius: `${theme.radius.pill}px`,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text variant="body" weight="medium">
            重试
          </Text>
        </Pressable>
      ) : null}
    </view>
  );
}

/** Wraps a region so the four states are impossible to forget. */
export interface AsyncBoundaryProps {
  loading: boolean;
  error: AppError | null;
  isEmpty: boolean;
  skeleton?: () => ReactNode;
  empty?: () => ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}

export function AsyncBoundary({
  loading,
  error,
  isEmpty,
  skeleton,
  empty,
  onRetry,
  children,
}: AsyncBoundaryProps) {
  if (loading) return <>{skeleton ? skeleton() : <Skeleton height={120} />}</>;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty) return <>{empty ? empty() : <EmptyState title="这里还没有内容" />}</>;
  return <>{children}</>;
}