// LIFF route group root layout — passthrough only
// 實際 LIFF 初始化邏輯在 /t/[tenantSlug]/layout.tsx
export default function LiffRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
