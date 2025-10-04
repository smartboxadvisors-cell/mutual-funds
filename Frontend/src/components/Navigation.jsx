// src/components/Navigation.jsx
import { Link, useLocation } from 'react-router-dom';
import styles from '../styles/navigation.module.css';

export default function Navigation() {
  const location = useLocation();

  return (
    <nav className={styles.navbar}>
      <div className={styles.navContainer}>
        <div className={styles.logo}>
          <Link to="/" className={styles.logoLink}>
            PP Capital
          </Link>
        </div>

        <div className={styles.navLinks}>
          <Link
            to="/"
            className={`${styles.navLink} ${location.pathname === '/' ? styles.active : ''}`}
          >
            Mutual Funds
          </Link>
          <Link
            to="/trading"
            className={`${styles.navLink} ${location.pathname === '/trading' ? styles.active : ''}`}
          >
            Trading
          </Link>
        </div>

        <div className={styles.userInfo}>
          <span>Welcome, User</span>
        </div>
      </div>
    </nav>
  );
}
