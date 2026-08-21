// Soft backgrounds with a darker ink of the same hue, so initials stay legible.
export const AVATAR_COLORS = {
  sage: { bg: "#d7e3d8", ink: "#2f6f4e" },
  blush: { bg: "#f2dbe0", ink: "#a8564a" },
  lilac: { bg: "#ddd9ee", ink: "#5b4f7d" },
  sand: { bg: "#ecdcc2", ink: "#8a6a35" },
  sky: { bg: "#d3dfe9", ink: "#3d5a72" },
  mint: { bg: "#d2e8de", ink: "#2f6f5e" },
};

export const COLOR_KEYS = Object.keys(AVATAR_COLORS);

// Nobody should ever render as a grey blob, so an unset colour is derived from
// the user id — stable for a given account, and the same everywhere it appears.
export function colorFor(profile) {
  if (profile?.avatar_color && AVATAR_COLORS[profile.avatar_color]) {
    return AVATAR_COLORS[profile.avatar_color];
  }
  const id = String(profile?.id ?? "");
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return AVATAR_COLORS[COLOR_KEYS[sum % COLOR_KEYS.length]];
}

export function initials(profile) {
  const a = profile?.first_name?.trim()?.[0] ?? "";
  const b = profile?.last_name?.trim()?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export default function Avatar({ profile, size = 36, url, color }) {
  // `url` and `color` let the editor preview an unsaved choice.
  const photo = url !== undefined ? url : profile?.avatar_url;
  const swatch = color ? AVATAR_COLORS[color] : colorFor(profile);
  const style = { width: size, height: size };

  if (photo) {
    return <img className="avatar" src={photo} alt="" style={style} />;
  }
  return (
    <span
      className="avatar avatar-initials"
      style={{
        ...style,
        background: swatch.bg,
        color: swatch.ink,
        fontSize: Math.round(size * 0.4),
      }}
      aria-hidden="true"
    >
      {initials(profile)}
    </span>
  );
}
