# SessionShare

Easily share files in multiple times with a single link!

Built using [Vue.js](https://vuejs.org/) on [Cloudflare Workers](https://workers.cloudflare.com/), with Durable Objects,
R2 and Cloudflare Pages. Also supports end-to-end AES-256-GCM file encryption.

This project was created for the [Cloudflare Developer Challenge 2022](https://challenge.developers.cloudflare.com/) and
was selected as one of the winners 🎉⚡️

![Preview](preview/mix.png)

## Why ?

When working with several people, it is often necessary to send files to each other. There are many services for sending a 
single file, but I haven't found one that allows you to send multiple files multiple times without the need to send a new
link each time.

## Features

* Use a single link to share multiple files in multiple times
* Support for end-to-end AES-256-GCM file encryption
* Blazing fast thanks to Cloudflare Workers
* Uploaded/deleted files are instantly visible to everyone in the session

## Planned features

* Support for larger files using multipart upload (currently limited to 100 MB)

## Credits

Avatars by [Freepik](https://www.freepik.com/).
