module.exports = {
	globDirectory: 'dist/',
	globPatterns: [
		'**/*.{wav,html,json,js,css}'
	],
	ignoreURLParametersMatching: [
		/^utm_/,
		/^fbclid$/
	],
	swDest: 'dist/sw.js'
};