import { NavLink } from 'react-router-dom';

function Header() {
  return (
    <header className="site-header">
      <NavLink to="/" className="site-title">
        Elijah
      </NavLink>
      <nav aria-label="Primary navigation" className="site-nav">
        <NavLink to="/">Home</NavLink>
        <NavLink to="/shop">Shop</NavLink>
      </nav>
    </header>
  );
}

export default Header;
