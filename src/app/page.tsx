import type { Metadata } from "next";
import SpeedTest from "@/components/SpeedTest";
import { SITE } from "./site";

export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
  alternates: { canonical: "/" },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      url: SITE.url,
      name: SITE.name,
      description: SITE.description,
      inLanguage: "fr-TN",
      publisher: {
        "@id": `${SITE.url}/#organization`,
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE.url}/#organization`,
      url: SITE.url,
      name: SITE.name,
      logo: {
        "@type": "ImageObject",
        url: `${SITE.url}/icon`,
      },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE.url}/#speedtest`,
      name: SITE.name,
      url: SITE.url,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript",
      inLanguage: "fr-TN",
      description: SITE.description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "TND",
        availability: "https://schema.org/InStock",
      },
      isPartOf: { "@id": `${SITE.url}/#website` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE.url}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Comment tester la vitesse de ma connexion internet en Tunisie ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Cliquez simplement sur le bouton orange « Démarrer ». Le test mesure automatiquement votre débit de téléchargement, votre débit d'envoi et votre ping (latence) en moins d'une minute, sans inscription ni installation.",
          },
        },
        {
          "@type": "Question",
          name: "Quelle vitesse internet moyenne en Tunisie ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Les débits varient selon votre opérateur (Orange Tunisie, Ooredoo ou Tunisie Telecom) et la technologie utilisée : fibre, ADSL, 4G, 4G+ ou 5G. Une ligne fibre peut dépasser plusieurs centaines de Mb/s selon votre forfait.",
          },
        },
        {
          "@type": "Question",
          name: "Qu'est-ce que le ping ou la latence ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Le ping, ou latence, mesure le temps en millisecondes que met un paquet de données pour aller et revenir du serveur. Plus il est bas, plus votre connexion est réactive, ce qui est crucial pour les jeux en ligne et les appels vidéo.",
          },
        },
        {
          "@type": "Question",
          name: "Pourquoi ma vitesse Wi-Fi est-elle plus lente que ma vitesse filaire ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Le Wi-Fi partage la bande passante et subit la distance, les murs et les interférences. Pour mesurer la vitesse réelle de votre ligne, testez en câble Ethernet (RJ45) directement branché sur la box.",
          },
        },
        {
          "@type": "Question",
          name: "Ce test de vitesse est-il gratuit et sans inscription ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Oui, notre test de vitesse internet en Tunisie est 100 % gratuit, illimité et ne demande aucune inscription ni installation de logiciel.",
          },
        },
      ],
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SpeedTest />
    </>
  );
}