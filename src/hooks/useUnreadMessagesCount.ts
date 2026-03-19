import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useUnreadMessagesCount(userId: string | undefined): number {
  const [count, setCount] = useState(0);

  const fetchCount = async () => {
    if (!userId) return;
    const { count: c } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('is_read', false);
    setCount(c ?? 0);
  };

  useEffect(() => {
    fetchCount();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        () => fetchCount()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
