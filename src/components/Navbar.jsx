/**
 * Top navigation bar for the SQL learning platform.
 */
function Navbar() {
  return (
    <header className="navbar">
      <div className="navbar__brand">
        <div className="navbar__logo" aria-hidden="true">
          SQL
        </div>
        <div>
          <div className="navbar__title">DataStride SQL</div>
          <div className="navbar__subtitle">Practice · Learn · Master</div>
        </div>
      </div>
      <nav className="navbar__actions" aria-label="Platform links">
        <span>Practice</span>
      </nav>
    </header>
  );
}

export default Navbar;
