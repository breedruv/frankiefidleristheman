import Link from "next/link";

export default function Home() {
  return (
    <main className="hero">
      <div className="hero-card">
        <div className="hero-text">welcome to the btown Spartians webpage.</div>
        <Link className="hero-button" href="/party">
          continue
        </Link>
      </div>
    </main>
  );
}
