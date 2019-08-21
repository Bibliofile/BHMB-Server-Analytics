import { string } from 'rollup-plugin-string'
import typescript from 'rollup-plugin-typescript2'
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import { terser } from 'rollup-plugin-terser'

export default {
  input: './src/index.ts',
  output: {
    file: 'build/bundle.js',
    // Output in a format that will work for both browsers and cli apps
    format: 'umd',
    // For making debugging easier, fine to disable
    sourcemap: true,

    globals: {
      '@bhmb/bot': '@bhmb/bot'
    }
  },
  plugins: [
    typescript(),
    resolve(),
    commonjs(),
    string({ include: ['**/*.html', '**/*.css', '**/*.txt']}),
    terser()
  ],

  // Settings to avoid warnings and configure correctly for browsers
  external: ['@bhmb/bot']
}
