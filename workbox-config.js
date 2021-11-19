module.exports = {
	globDirectory: 'dist/',
	globPatterns: [
		'**/*.{wav,html,js,css}'
	],
	ignoreURLParametersMatching: [
		/^utm_/,
		/^fbclid$/
	],
	swDest: 'dist/sw.js'
};