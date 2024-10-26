import { Hono } from 'hono'
import * as cheerio from 'cheerio'
import { cors } from 'hono/cors'
import JSZip from 'jszip'
import { stream, streamText, streamSSE } from 'hono/streaming'
const zip = new JSZip()

async function getNerdFontLinks(): Promise<{ [fontName: string]: string }> {
	const response = await fetch('https://www.nerdfonts.com/font-downloads')
	const html = await response.text()
	const $ = cheerio.load(html)

	return $('a')
		.filter((_, link) => $(link).text().trim().toLowerCase() === 'download')
		.toArray()
		.reduce((acc, link) => {
			const fontName = $(link)
				.attr('href')
				?.split('/')
				.pop()
				?.replace('.zip', '')
			if (fontName) {
				acc[fontName] = $(link).attr('href') as string
			}
			return acc
		}, {} as { [fontName: string]: string })
}

const app = new Hono()
app.use('*', cors())

app.get('/fonts', async c => {
	const fontLinkFile = Bun.file('font-links.json')
	const exists = await fontLinkFile.exists()
	let links = {}
	if (exists) {
		links = (await fontLinkFile.json()) as { [fontName: string]: string }
	}
	if (!exists || Object.keys(links).length === 0) {
		links = await getNerdFontLinks()
		fontLinkFile.writer().write(JSON.stringify(links, null, 2))
	}
	return c.json(links)
})
app.get('/fonts/:name', async c => {
	// c.header('Content-Type', 'text/event-stream')
	c.header('Cache-Control', 'no-cache')
	c.header('Connection', 'keep-alive')
	console.log('getting font')
	let links: Record<string, string> = {}
	const fontLinkFile = Bun.file('font-links.json')

	if (await fontLinkFile.exists()) {
		links = (await fontLinkFile.json()) as { [fontName: string]: string }
	} else {
		links = await getNerdFontLinks()
		fontLinkFile.writer().write(JSON.stringify(links, null, 2))
	}

	const fontName = c.req.param('name')
	const fontUrl = links[fontName]

	if (!fontUrl) return c.json({ error: 'Font not found' }, 404)
	const font = await fetch(fontUrl)
	if (!font.ok) throw new Error('Failed to download font')

	return new Response(font.body)
})

app.get('/', c => {
	return c.text('Hello Hono!')
})

const foo = Bun.file('foo.txt')

export default {
	port: 3002,
	fetch: app.fetch
}
