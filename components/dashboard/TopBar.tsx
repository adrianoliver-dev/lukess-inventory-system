import type { Profile } from "@/lib/types";

interface TopBarProps {
  profile: Profile;
}

export default function TopBar({ profile }: TopBarProps): React.JSX.Element {
  const initials = profile.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-30 h-14 bg-zinc-950 text-zinc-50 border-b border-zinc-900 flex items-center justify-between pl-16 pr-4 lg:px-6">
      {/* Left: System title */}
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-medium text-zinc-50">Sistema de Inventario</h2>
      </div>

      {/* Right: User avatar */}
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-zinc-200">
            {profile.full_name}
          </p>
          <p className="text-xs text-zinc-400">{profile.email}</p>
        </div>
        <div className="w-9 h-9 bg-zinc-700 rounded-full flex items-center justify-center">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <span className="text-sm font-medium text-zinc-50">{initials}</span>
          )}
        </div>
      </div>
    </header>
  );
}
