---
title: "How do I get mixed ssl content?"
original_url: "https://blog.mywebmaster.co.uk/how-do-i-get-mixed-ssl-content/"
published: "2018-08-28T22:37:13.000Z"
description: "After installing an SSL certificare you may get the Mixed content warning after initial HTML is loaded over a secure HTTPS connection but some other files (such as images, videos, etc) are loading over an insecure HTTP connection. This is called mixed content because both HTTP and HTTPS content are"
type: "posts"
---
After installing an SSL certificare you may get the **Mixed content warning **after initial HTML is loaded over a secure HTTPS connection but some other files (such as images, videos, etc) are loading over an insecure HTTP connection. This is called mixed content because both HTTP and HTTPS content are displaying on the same page. Modern browsers display warnings about this type of content to indicate to the site visitor that this page contains some insecure resources.

**How to fix this?**

Open the developer tools on your browser [(here is how) ](https://robotninja.com/blog/browser-developer-tools/?ref=blog.mywebmaster.co.uk) click on the Console Tab, and look out for warining message saying “Loading mixed (insecure) display content” followed by the file url. This is the file that needs to be called on a secure url (HTTPS).

The process of changing code is somewhat technical so I dont recommend you experiment, it could end in disaster, so better you get an expect to sort it out for you. It should not cost more than an Hours’s development time from an experienced website developer.

If you are feeling brave here is a youtube video that show you how [Video by Neil Matthews](https://www.youtube.com/watch?v=eHI6bBvyciM&ref=blog.mywebmaster.co.uk)