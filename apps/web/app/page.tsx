import { Hero } from "@/components/hero";
import { CodeIntro } from "@/components/code-intro";
import { About } from "@/components/about";
import { Projects } from "@/components/projects";
import { Links } from "@/components/links";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <main className="relative">
      <Hero />
      <CodeIntro />
      <About />
      <Projects />
      <Links />
      <Footer />
    </main>
  );
}
