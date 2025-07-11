import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Monitor, Smartphone, Shield, Zap, Phone, Mail, Facebook, Twitter } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b bg-white px-4 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">mw</span>
            </div>
            <span className="text-xl font-semibold text-gray-900">mywebmaster</span>
          </div>

          <nav className="hidden md:flex items-center space-x-8">
            <a href="#" className="text-gray-600 hover:text-gray-900">Portfolio</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">Webmaster</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">Web Design</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">Mobile Apps</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">Products</a>
            <Button className="bg-primary hover:bg-primary/90">Contact</Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto text-center">
          <h1 className="text-5xl font-bold text-primary mb-6">
            Online & Digital Solutions
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            We specialise in digital transformation and digital tools that fuel efficiency and growth. We help you build and maintain digital channels.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button size="lg" className="bg-primary hover:bg-primary/90">
              SERVICES
            </Button>
            <Button size="lg" variant="outline">
              GET IN TOUCH
            </Button>
          </div>
          <div className="w-full max-w-2xl mx-auto h-80 flex items-center justify-center">
            <img src="https://ext.same-assets.com/1391034936/1573500797.jpeg" alt="Digital Solutions Illustration" className="max-w-full max-h-full object-contain" />
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-primary mb-4">
              Solutions For your Business
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              We build digital solutions using NoCode visual blocks for fast delivery and intuitive use
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <Monitor className="w-12 h-12 text-primary mb-4" />
                <CardTitle className="text-xl">Website Development</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  We build your custom marketing website or web application using a drag & drop visual builder.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <Smartphone className="w-12 h-12 text-primary mb-4" />
                <CardTitle className="text-xl">Mobile Applications</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  We build your custom mobile application to deliver your customer unique brand experiences.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <Shield className="w-12 h-12 text-primary mb-4" />
                <CardTitle className="text-xl">Internal Tools</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  Custom Internal web application designed to increase your internal system productivity and efficiency.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <Zap className="w-12 h-12 text-primary mb-4" />
                <CardTitle className="text-xl">Automation & Integration</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  Adopt AI powered automation to visually integrate all your systems and data.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Technical Support Section */}
      <section className="py-20 px-4 purple-gradient">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            TECHNICAL SUPPORT
          </h2>
          <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
            We provide ad-hoc technical support for issues relating to website, mobile app and social media channels.
          </p>
          <Button variant="secondary" size="lg">
            REQUEST SUPPORT
          </Button>
        </div>
      </section>

      {/* Charity Section */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-primary mb-6">
              We Love Charity
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              If you are a UK registered Charity, we offer the following package. Please get in touch for further details.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Website Development</h3>
                <p className="text-gray-600">
                  Build and manage your NoCode powered website using Webflow platform that comes with a 50% subscription discount.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Free Software & Resources</h3>
                <p className="text-gray-600">
                  Registered charities qualify for free and almost free subscription for cloud based software like Office365, Salesforce and AWS.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Digital Fundraising</h3>
                <p className="text-gray-600">
                  Help you setup digital fundraising channels and guide you with managing services like Paypal Giving, Facebook Donate, and fundraiseup.com.
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="w-80 h-80 rounded-full overflow-hidden">
                <img src="https://ext.same-assets.com/1391034936/3133731693.png" alt="Charity Illustration" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Partners Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold text-primary mb-6">
            NoCode Partners We Love
          </h2>
          <p className="text-xl text-gray-600 max-w-4xl mx-auto mb-12">
            We works with the best Nocode platforms to visually build intuitive web and mobile applications that will help your business adopt new digital tools to speed up, automate and integrate all your systems & processes.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center opacity-60">
            <img src="https://ext.same-assets.com/1391034936/2723920787.jpeg" alt="n8n.io" className="h-12 mx-auto" />
            <img src="https://ext.same-assets.com/1391034936/798157746.png" alt="Wix Studio" className="h-12 mx-auto" />
            <img src="https://ext.same-assets.com/1391034936/3069783691.jpeg" alt="Webflow" className="h-12 mx-auto" />
            <img src="https://ext.same-assets.com/1391034936/217198219.png" alt="Webstudio" className="h-12 mx-auto" />
            <img src="https://ext.same-assets.com/1391034936/2276633047.jpeg" alt="Ycode" className="h-12 mx-auto" />
            <img src="https://ext.same-assets.com/1391034936/4192710066.png" alt="Softr" className="h-12 mx-auto" />
          </div>

          <div className="mt-8">
            <a href="#" className="text-primary hover:underline">Explore NoCode Resources</a>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold text-primary mb-6">
            Customer Reviews
          </h2>
          <p className="text-xl text-gray-600 mb-12">
            Join <strong>lots</strong> of happy customers satisfied with their results - <a href="#" className="text-primary hover:underline">Read More Reviews</a>
          </p>

          <div className="max-w-4xl mx-auto">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <Button variant="ghost" size="icon">
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <div className="text-center flex-1">
                    <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4"></div>
                    <p className="text-lg text-gray-700 italic">
                      "I highly recommend mywebmaster.co.uk. The assistance received was professional and efficient. We are very pleased with the service and the technical abilities of team."
                    </p>
                    <div className="mt-4">
                      <p className="font-semibold">Rebecca Conder</p>
                      <p className="text-gray-600">dawnandday.com</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon">
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-20 px-4 purple-gradient">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-6">
              Empower Yourself
            </h2>
            <h3 className="text-2xl font-semibold text-white mb-4">
              Get in touch with us Today!
            </h3>
            <p className="text-white/90 max-w-2xl mx-auto">
              Have questions about pricing, plans, or our Awesome Product? Fill out the form and a representative will be in touch shortly.
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <form className="space-y-6">
              <Input
                placeholder="Your Name"
                className="bg-white/90 border-0"
              />
              <Input
                type="email"
                placeholder="Your Email Address"
                className="bg-white/90 border-0"
              />
              <div className="flex">
                <div className="w-20 bg-white/90 rounded-l-md flex items-center justify-center">
                  <img src="https://ext.same-assets.com/1391034936/1475019134.svg" alt="Flag" className="w-6 h-4" />
                </div>
                <Input
                  placeholder="Your Phone Number"
                  className="bg-white/90 border-0 rounded-l-none flex-1"
                />
              </div>
              <Input
                placeholder="Your Company Name"
                className="bg-white/90 border-0"
              />
              <Select>
                <SelectTrigger className="bg-white/90 border-0">
                  <SelectValue placeholder="Your Company Size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1-10 employees</SelectItem>
                  <SelectItem value="11-50">11-50 employees</SelectItem>
                  <SelectItem value="51-200">51-200 employees</SelectItem>
                  <SelectItem value="200+">200+ employees</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Your Message"
                rows={4}
                className="bg-white/90 border-0"
              />
              <Button className="w-full bg-white/20 hover:bg-white/30 text-white border border-white/30">
                Submit Enquiry
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-4 bg-white border-t">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">mw</span>
                </div>
                <span className="text-xl font-semibold text-gray-900">mywebmaster</span>
              </div>
              <p className="text-gray-600 mb-4">
                Webmaster, web designer, website manager, digital marketing, mobile app developer based in England.
              </p>
              <div className="flex space-x-4">
                <Facebook className="w-5 h-5 text-gray-400" />
                <Twitter className="w-5 h-5 text-gray-400" />
                <Mail className="w-5 h-5 text-gray-400" />
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Services</h4>
              <ul className="space-y-2 text-gray-600">
                <li><a href="#" className="hover:text-gray-900">Webmaster</a></li>
                <li><a href="#" className="hover:text-gray-900">Web Design</a></li>
                <li><a href="#" className="hover:text-gray-900">Mobile Apps</a></li>
                <li><a href="#" className="hover:text-gray-900">Tech Support</a></li>
                <li><a href="#" className="hover:text-gray-900">Ycode Platform</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Quick Links</h4>
              <ul className="space-y-2 text-gray-600">
                <li><a href="#" className="hover:text-gray-900">Membership App</a></li>
                <li><a href="#" className="hover:text-gray-900">Computer Shop App</a></li>
                <li><a href="#" className="hover:text-gray-900">Customer Reviews</a></li>
                <li><a href="#" className="hover:text-gray-900">Affiliate Partners</a></li>
                <li><a href="#" className="hover:text-gray-900">NoCode Resources</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Contact</h4>
              <ul className="space-y-2 text-gray-600">
                <li>mywebmaster.co.uk</li>
                <li>133 Winter Road</li>
                <li>Southsea, PO4 8DR</li>
              </ul>
            </div>
          </div>

          <div className="border-t mt-12 pt-8 text-center text-gray-500">
            <p>© 2022 Acronym Computers Ltd | Company Reg: GB 772432324 | ICO Reg No.ZA444418 | Terms & Conditions | Privacy Policy</p>
            <div className="mt-4">
              <a href="#" className="text-primary hover:underline">Made with Softr</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
