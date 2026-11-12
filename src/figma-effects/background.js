import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ShaderEffect } from '@figma/expressive-components';
import * as dither from './dither.ts';
import * as chrome from './chrome.ts';
import * as refraction from './refraction.ts';

const shaders = [
              { setup: dither.setup, render: dither.render, params: { algorithm: "Bayer 4x4", monoColor: { r: 0.8980392217636108, g: 0.3019607961177826, b: 0.20000000298023224, a: 1 }, contrast: 1.0399999618530273, levels: 6, mono: false, brightness: 96, pixelSize: 3 }, manifest: dither.manifest },
              {
                setup: chrome.setup,
                render: chrome.render,
                params: {
                  evolution: 0,
                  chromeGradient: {
                    stops: [
                      { position: 0.18000000715255737, color: { r: 1, g: 1, b: 1, a: 1 } },
                      { position: 0.4300000071525574, color: { r: 0.27799999713897705, g: 0.3019999861717224, b: 0.32899999618530273, a: 1 } },
                      { position: 0.4300000071525574, color: { r: 1, g: 1, b: 1, a: 1 } },
                      { position: 0.550000011920929, color: { r: 1, g: 1, b: 1, a: 1 } },
                      { position: 0.550000011920929, color: { r: 0.24699999392032623, g: 0.24699999392032623, b: 0.25099998712539673, a: 1 } },
                      { position: 0.699999988079071, color: { r: 0.24699999392032623, g: 0.24699999392032623, b: 0.25099998712539673, a: 1 } },
                      { position: 0.699999988079071, color: { r: 1, g: 1, b: 1, a: 1 } },
                    ],
                  },
                  blurStrength: 7.5,
                  phase: 0,
                  gradientOffset: 0,
                  noiseScale: 50,
                  chromaSepR: 10,
                  heightIntensity: 100,
                  roughness: 0,
                  noiseAngle: 30,
                  stretch: 200,
                  gradientRepeats: 2,
                },
                manifest: chrome.manifest,
              },
              { setup: refraction.setup, render: refraction.render, params: { iorDispersion: 4, frost: 0, centerHandle: { x: -200, y: 51.8485221862793, radius: 8.15999984741211, angle: 45 }, amount: 28, patternType: 1, seamlessness: 7, pixelWrapMode: 0 }, manifest: refraction.manifest },

];

const backgroundImage = "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 567 1075' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(-37.475 64.354 -4.8746 -140.73 374.75 -106.04)'><stop stop-color='rgba(229,77,51,1)' offset='0'/><stop stop-color='rgba(232,99,77,0.875)' offset='0.125'/><stop stop-color='rgba(236,122,102,0.75)' offset='0.25'/><stop stop-color='rgba(242,166,153,0.5)' offset='0.5'/><stop stop-color='rgba(255,255,255,0)' offset='1'/></radialGradient></defs></svg>\"), url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 567 1075' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(-41.55 54.27 -1.721 -65.323 231.52 59.26)'><stop stop-color='rgba(255,37,0,1)' offset='0'/><stop stop-color='rgba(255,51,16,0.9375)' offset='0.0625'/><stop stop-color='rgba(255,64,32,0.875)' offset='0.125'/><stop stop-color='rgba(255,92,64,0.75)' offset='0.25'/><stop stop-color='rgba(255,119,96,0.625)' offset='0.375'/><stop stop-color='rgba(255,146,128,0.5)' offset='0.5'/><stop stop-color='rgba(255,255,255,0)' offset='1'/></radialGradient></defs></svg>\"), linear-gradient(83.54089743067472deg, rgb(255, 255, 255) 17.731%, rgb(255, 183, 171) 81.335%)";

export function mountFigmaChrome(container) {
  const root = createRoot(container);
  root.render(createElement(ShaderEffect, { shaders, className: 'figma-effect-surface' },
    createElement('div', { className: 'figma-effect-surface', style: { backgroundImage, borderRadius: 25 } })));
  return () => root.unmount();
}
