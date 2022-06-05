# SessionShare

Easily share files in multiple times with a single link!

## Why ?

When working with several people, it is often necessary to send files to each other. There are many services to send a
single file, but I haven't found one that allows you to send several files in several times without having to send a new
link each time.

## Features
* Use a single link to share multiple files in multiples times
* Blazing fast thanks to Cloudflare Workers
* Uploaded/deleted files are instantly visible by everyone in the session

## Planned features

This project is far from its final state, lots of features are planned and will be implemented _soon_:
* End-to-end file encryption (very important, I'll do it ASAP)
* File expiration and usage limits (pretty important if I don't want a crazy bill)
* Rework frontend (more file details, use Vue components, etc...)
* Add file rename option
* Support for larger files using multipart upload
