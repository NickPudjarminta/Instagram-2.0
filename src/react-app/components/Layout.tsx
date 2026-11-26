import { Outlet } from "react-router-dom";
import { CornerNavButton } from "./CornerNavButton";

export function Layout() {
  return (
    <>
      <CornerNavButton />
      <div className="page">
        <Outlet />
      </div>
    </>
  );
}
