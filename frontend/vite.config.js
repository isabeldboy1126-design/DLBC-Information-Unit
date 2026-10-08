import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function validateSupabaseAuthPlugin(env) {
  return {
    name: 'validate-supabase-auth',
    configResolved() {
      const isRelease = Boolean(
        process.env.CI ||
        process.env.GITHUB_ACTIONS ||
        process.env.TAURI_ENV_PLATFORM ||
        process.env.REQUIRE_SUPABASE_AUTH === 'true'
      )
      const key = (
        env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        env.VITE_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        ''
      ).trim()
      const url = (
        env.VITE_SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        'https://szgdxynzjzgtingwbwcu.supabase.co'
      ).trim()

      if (isRelease) {
        if (!key) {
          throw new Error(
            '\n[DLBC Production Build Error] VITE_SUPABASE_PUBLISHABLE_KEY is missing or empty!\n' +
            'A release build or packaging step must never produce an installer with unconfigured authentication.\n' +
            'Ensure VITE_SUPABASE_PUBLISHABLE_KEY is set in GitHub Actions secrets or build environment.\n'
          )
        }
        if (!url) {
          throw new Error(
            '\n[DLBC Production Build Error] VITE_SUPABASE_URL is missing or empty!\n' +
            'Aborting build to prevent generating an installer with unconfigured authentication.\n'
          )
        }
      } else if (!key) {
        console.warn(
          '\n⚠️  [DLBC Auth Notice] VITE_SUPABASE_PUBLISHABLE_KEY is not set in this local build.\n' +
          'Authentication will be unconfigured unless provided in .env.local.\n'
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), validateSupabaseAuthPlugin(env)],
    server: {
      host: '0.0.0.0',
      port: 5173,
      watch: {
        ignored: ['**/src-tauri/**', '**/android/**'],
      },
    },
  }
})

