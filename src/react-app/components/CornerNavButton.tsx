import { Link, useLocation } from "react-router-dom";

export function CornerNavButton() {
  const location = useLocation();
  const isSettings = location.pathname.startsWith("/settings");

  if (isSettings) {
    return (
      <Link to="/" className="corner-button back" aria-label="Back to feed">
        ← Back
      </Link>
    );
  }

  return (
    <Link to="/settings" className="corner-button" aria-label="Settings">
      ⚙
    </Link>
  );
}
