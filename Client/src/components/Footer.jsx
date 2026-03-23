import "./Footer.css";

export default function Footer() {
  return (
    <footer className="page-footer">
      <p>&copy; {new Date().getFullYear()} CineVillage. All Rights Reserved.</p>
    </footer>
  );
}
