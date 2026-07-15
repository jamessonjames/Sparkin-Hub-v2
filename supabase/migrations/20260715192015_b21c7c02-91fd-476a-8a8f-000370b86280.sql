
-- Attach trigger on auth.users to run handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profiles and user_roles for existing auth users
DO $$
DECLARE
  u RECORD;
  cnt INT;
  r public.app_role;
BEGIN
  FOR u IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    INSERT INTO public.profiles (id, name, email)
    VALUES (u.id, COALESCE(u.raw_user_meta_data->>'name', split_part(u.email,'@',1)), u.email)
    ON CONFLICT (id) DO NOTHING;

    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = u.id) THEN
      SELECT COUNT(*) INTO cnt FROM public.user_roles;
      r := CASE WHEN cnt = 0 THEN 'owner'::public.app_role ELSE 'collaborator'::public.app_role END;
      INSERT INTO public.user_roles (user_id, role) VALUES (u.id, r);
    END IF;
  END LOOP;
END $$;
