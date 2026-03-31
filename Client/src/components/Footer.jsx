import "./Footer.css";

export default function Footer() {
  return (
    <footer className="page-footer text-light">
      <div className="footer-sections">
        <section className="footer-section">
          <p className="footer-title">certifications</p>
          <div className="footer-logo-row footer-logo-row-certs">
            <img src="/ComodoSecure.png" alt="Comodo Secure" />
            <img src="/PCIDSS.png" alt="PCI DSS" />
          </div>
        </section>

        <section className="footer-section">
          <p className="footer-title">connect with us</p>
          <div className="footer-social-row">
            <a href="#" aria-label="Facebook"><i className="bi bi-facebook" /></a>
            <a href="#" aria-label="X"><i className="bi bi-twitter-x" /></a>
            <a href="#" aria-label="YouTube"><i className="bi bi-youtube" /></a>
            <a href="#" aria-label="Instagram"><i className="bi bi-instagram" /></a>
            <a href="#" aria-label="TikTok"><i className="bi bi-tiktok" /></a>
          </div>
        </section>

        <section className="footer-section">
          <p className="footer-title">supported payments</p>
          <div className="footer-logo-row footer-logo-row-payments">
            <img src="/VISA.png" alt="Visa" />
            <img src="/MasterCard.png" alt="Mastercard" />
            <img src="/AMEX.png" alt="American Express" />
          </div>
        </section>
      </div>

      <div className="footer-divider" aria-hidden="true" />

      <small className="footer-copyright">
        &copy; {new Date().getFullYear()} CineVillage. All Rights Reserved.
      </small>
    </footer>
  );
}
