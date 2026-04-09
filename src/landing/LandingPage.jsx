import { useEffect, useState } from 'react'
import { fetchPublicSiteData } from '../data/siteContent.js'
import { defaultLandingContent, defaultProducts, defaultSettings } from '../data/siteDefaults.js'
import useLenis from './hooks/useLenis.js'
import Navbar from './components/Navbar.jsx'
import Hero from './sections/Hero.jsx'
import Emotional from './sections/Emotional.jsx'
import Products from './sections/Products.jsx'
import Exclusivity from './sections/Exclusivity.jsx'
import CTASection from './sections/CTASection.jsx'
import SocialProof from './sections/SocialProof.jsx'
import Footer from './sections/Footer.jsx'
import './landing.css'

export default function LandingPage() {
  useLenis()
  const [siteData, setSiteData] = useState({
    content: defaultLandingContent,
    settings: defaultSettings,
    products: defaultProducts,
  })

  useEffect(() => {
    document.title = 'Decoratie â€” Sua mesa nunca mais será comum.'
  }, [])

  useEffect(() => {
    let active = true

    async function loadSiteData() {
      try {
        const nextData = await fetchPublicSiteData()

        if (active) {
          setSiteData(nextData)
        }
      } catch (error) {
        console.error('Nao foi possivel carregar os dados publicos do site.', error)
      }
    }

    loadSiteData()

    return () => {
      active = false
    }
  }, [])

  const { content, settings, products } = siteData

  return (
    <main className="decoratie">
      <Navbar settings={settings} />
      <Hero content={content} />
      <Emotional content={content} />
      <Products products={products} settings={settings} />
      <Exclusivity content={content} settings={settings} />
      <CTASection content={content} settings={settings} />
      <SocialProof />
      <Footer settings={settings} />
    </main>
  )
}
