import { format, formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return format(date, 'yyyy/MM/dd HH:mm', { locale: ja });
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  return formatDistanceToNow(date, { addSuffix: true, locale: ja });
}

export function formatDuration(startTime: string): string {
  const start = new Date(startTime);
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }
  return `${minutes}分`;
}