---
title: "How do Domain Name System work?"
original_url: "https://blog.mywebmaster.co.uk/how-do-domain-name-system-work/"
published: "2018-03-17T22:03:05.000Z"
description: "Every website has an IP address that identifies it among all others. Theoretically, you could navigate the web using only IP addresses instead of domain names, but this wouldn’t be practical. To understand how IP addresses and domains relate to each other, you need to get to know the"
type: "posts"
---
**Every website has an IP address that identifies it among all others. Theoretically, you could navigate the web using only IP addresses instead of domain names, but this wouldn’t be practical. To understand how IP addresses and domains relate to each other, you need to get to know the Domain Name System (DNS).**

The DNS enables us to navigate the web more intuitively. In this article, we’re going to talk more about what the DNS is and how it works. Then, we’ll introduce you to multiple DNS-related terms you should know and talk about why they’re important. Let’s jump right in!

If you’ve ever used a browser, you know the drill – you type a domain, click enter, and it loads the page you want. It’s a simple process that works even though there are over a billion websites available online.

However, each of those websites also has a unique IP address you can use to move between them. Those IP addresses correspond to the servers that host each website. When you register a new domain, you’re telling the world, “Hey, this URL leads to this particular IP address!”. That way, users don’t need to remember complicated strings of numbers.

The thing is, your browser doesn’t automatically know what domain name leads to each address. It has to check the DNS to see what address it corresponds to before sending you there. This is a system that stores information about which domains and IP addresses are linked.

As you might expect, this is too much information for a single computer to handle. Instead, we’re talking about a decentralized system, with plenty of companies that run their own servers. Google, for example, runs a public DNS server, as does Verisign, and Yandex. Most domain registrars also operate their own ones. Usually, this is down to security and speed concerns, and they often dominate the discussion regarding benefits:

To explain a little more about how the system works, when you register a domain name, it ‘propagates’ the information across all DNS servers. This can take up to 48 hours (hence the oft-repeated warning from registrars).

Your Internet Service Provider (ISP) probably runs a DNS server as well, and your router may be configured to use it by default. Ideally, most DNS servers should work just the same, but there are benefits to using a public one if, for example, your ISP blocks certain websites.