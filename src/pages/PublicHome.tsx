import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import careHero from '@/assets/patrivers-care-hero.jpg';
import brandLogo from '@/assets/patrivers-logo.png';

const FALLBACK_PHONE = '';
const WHATSAPP_NUMBER = '233533064674';
const WHATSAPP_TEXT = "Hello Patrivers Pharmacy, I'd like to make an enquiry.";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;

interface CompanyInfo {
  company_name: string;
  tagline: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  website: string | null;
  logo_url: string | null;
}

const branches = [
  { name: 'Assin Praso', address: '' },
  { name: 'Twifo Hemang', address: '' },
  { name: 'Assin Bereku', address: '' },
];

const services = [
  ['Medicines', 'Genuine prescription and over-the-counter medicines.'],
  ['Pharmacist advice', 'Clear guidance on dosage and safe medicine use.'],
  ['Health essentials', 'Wellness, baby care, medical supplies, and personal care.'],
];

export default function PublicHome() {
  const [info, setInfo] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    const title = 'Patrivers Pharmacy | Community Pharmacy in Ghana';
    const description = 'Genuine medicines and clear pharmacist advice from Patrivers Pharmacy across three Ghana locations.';
    document.title = title;

    const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let element = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, key);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', '/');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);

    supabase
      .from('company_settings')
      .select('company_name, tagline, phone_primary, phone_secondary, email, address, city, region, country, website, logo_url')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setInfo(data as CompanyInfo);
      });
  }, []);

  const name = info?.company_name || 'Patrivers Pharmacy';
  const tagline = info?.tagline || 'Your health, our priority.';
  const phone = info?.phone_primary || FALLBACK_PHONE;
  const email = info?.email;
  const website = info?.website;

  useEffect(() => {
    const id = 'pharmacy-jsonld';
    document.getElementById(id)?.remove();
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = id;
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Pharmacy',
      name,
      description: tagline,
      url: website || '/',
      telephone: phone,
      ...(email ? { email } : {}),
    });
    document.head.appendChild(script);
    return () => { document.getElementById(id)?.remove(); };
  }, [name, tagline, phone, email, website]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-brand text-brand-foreground">
        <div className="mx-auto flex min-h-9 max-w-6xl items-center justify-between gap-4 px-5 py-2 text-xs sm:px-8">
          <p>{phone || 'Serving our communities across three locations'}</p>
          <div className="flex gap-5">
            {email && <a href={`mailto:${email}`} className="hover:underline">{email}</a>}
            <a href="/system" className="font-medium hover:underline">Staff login</a>
          </div>
        </div>
      </div>

      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-3" aria-label={`${name} home`}>
            <img src={info?.logo_url || brandLogo} alt={`${name} logo`} className="h-11 w-11 object-contain" />
            <span className="font-heading text-lg font-semibold text-brand">{name}</span>
          </a>
          <nav className="hidden items-center gap-7 text-xs font-semibold uppercase text-muted-foreground md:flex" aria-label="Primary navigation">
            <a href="#home" className="text-brand">Home</a>
            <a href="#about" className="transition-colors hover:text-brand">About</a>
            <a href="#services" className="transition-colors hover:text-brand">Services</a>
            <a href="#branches" className="transition-colors hover:text-brand">Branches</a>
            <a href="#contact" className="transition-colors hover:text-brand">Contact</a>
          </nav>
          <Button asChild size="sm" className="rounded-none bg-accent text-accent-foreground hover:bg-accent/90 md:hidden">
            <a href="#branches">Branches</a>
          </Button>
        </div>
      </header>

      <main>
        <section id="home" className="relative isolate min-h-[330px] overflow-hidden sm:min-h-[470px]">
          <img
            src={careHero}
            alt="A Ghanaian pharmacist holding a box of paracetamol tablets at the counter"
            width={1920}
            height={832}
            className="absolute inset-0 -z-20 h-full w-full object-cover object-[72%_center]"
          />
          <div className="absolute inset-0 -z-10 bg-background/20" />
          <div className="mx-auto flex min-h-[330px] max-w-6xl items-center px-5 py-16 sm:min-h-[470px] sm:px-8">
            <div className="max-w-xl">
              <p className="font-heading text-3xl font-semibold leading-tight text-brand sm:text-5xl">
                Caring for your health at every step.
              </p>
              <p className="mt-5 max-w-md text-base leading-7 text-foreground/75 sm:text-lg">
                Trusted medicines, practical advice, and personal service across our communities.
              </p>
              <Button asChild className="mt-7 rounded-none bg-brand text-brand-foreground hover:bg-brand/90">
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Make an enquiry</a>
              </Button>
            </div>
          </div>
        </section>

        <section id="about" className="border-b">
          <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-24">
            <h1 className="font-heading text-3xl font-medium text-brand sm:text-4xl">Patrivers Pharmacy</h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-muted-foreground">
              We provide safe, genuine, and affordable healthcare with expert pharmacist advice and personal attention. Our growing network keeps dependable pharmacy care close to the people we serve.
            </p>
            <a href="#branches" className="mt-8 inline-block border-b-2 border-accent pb-1 text-xs font-semibold uppercase text-brand">Find a branch</a>
          </div>
        </section>

        <section id="services" className="bg-secondary/50">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-20">
              <div>
                <p className="text-xs font-semibold uppercase text-accent">What we provide</p>
                <h2 className="mt-3 font-heading text-3xl font-medium text-brand sm:text-4xl">Care made straightforward.</h2>
              </div>
              <div className="border-t border-brand/20">
                {services.map(([title, description]) => (
                  <div key={title} className="grid gap-2 border-b border-brand/20 py-6 sm:grid-cols-[0.8fr_1.2fr] sm:gap-8">
                    <h3 className="font-heading text-lg font-medium text-brand">{title}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="branches" className="border-y">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase text-accent">Our locations</p>
              <h2 className="mt-3 font-heading text-3xl font-medium text-brand sm:text-4xl">Three branches. One standard of care.</h2>
              <p className="mt-4 leading-7 text-muted-foreground">Each branch address can be added as soon as it is confirmed. New locations will follow the same format automatically.</p>
            </div>
            <div className="mt-12 border-t border-brand/20">
              {branches.map((branch, index) => (
                <article key={branch.name} className="grid gap-3 border-b border-brand/20 py-7 sm:grid-cols-[4rem_1fr_1fr] sm:items-center">
                  <span className="text-xs font-semibold text-accent">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="font-heading text-xl font-medium text-brand">{branch.name}</h3>
                  <p className="text-sm text-muted-foreground">{branch.address || 'Address to be added'}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="bg-brand text-brand-foreground">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-brand-foreground/60">Contact Patrivers</p>
              <h2 className="mt-3 max-w-2xl font-heading text-3xl font-medium sm:text-5xl">Speak with our pharmacy team.</h2>
            </div>
            <Button asChild size="lg" className="w-fit rounded-none bg-accent text-accent-foreground hover:bg-accent/90">
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Start an enquiry</a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="bg-brand text-brand-foreground/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 border-t border-brand-foreground/20 px-5 py-7 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>&copy; {new Date().getFullYear()} {name}. All rights reserved.</p>
          <a href="/system" className="hover:text-brand-foreground">Staff system</a>
        </div>
      </footer>
    </div>
  );
}