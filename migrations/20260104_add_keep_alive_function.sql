-- Supabase無料枠の凍結を回避するためのkeep-alive関数
-- GitHub Actionsから定期的に呼び出される

-- keep_alive関数を作成（既に存在する場合は置き換え）
CREATE OR REPLACE FUNCTION public.keep_alive()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- 現在のタイムスタンプと簡単な統計情報を返す
  SELECT json_build_object(
    'status', 'ok',
    'timestamp', now(),
    'database', current_database(),
    'version', version()
  ) INTO result;
  
  RETURN result;
END;
$$;

-- 関数の説明を追加
COMMENT ON FUNCTION public.keep_alive() IS 
  'GitHub Actionsから定期的に呼び出され、Supabase無料枠の凍結を防ぐための関数';

-- anonロールとauthenticatedロールに実行権限を付与
GRANT EXECUTE ON FUNCTION public.keep_alive() TO anon;
GRANT EXECUTE ON FUNCTION public.keep_alive() TO authenticated;
GRANT EXECUTE ON FUNCTION public.keep_alive() TO service_role;
