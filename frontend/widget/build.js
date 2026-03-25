const esbuild = require('esbuild');

async function build() {
  await esbuild.build({
    entryPoints: ['widget/widget.tsx'],
    bundle: true,
    minify: true,
    outfile: '../public/widget.js',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
    },
  }).catch(() => process.exit(1));

  console.log('✅ Widget built successfully! Output: public/widget.js');
}

build();
