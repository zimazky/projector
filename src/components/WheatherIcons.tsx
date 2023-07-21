import React from 'react';

/** Массив с иконками погоды */
export const weatherIcons: JSX.Element[] = [
  // Ясно (clouds < 10%)
  <svg width='100%' viewBox="0 0 23 23">
    <path fill="#f15d46" stroke="none" d="m11 2a.8.8 90 000 18 .8.8 90 000-18"/>
  </svg>,
  // Малооблачно (clouds < 30%)
  <svg width='100%' viewBox="0 0 23 23">
    <path fill="#f15d46" stroke="none" d="m11 1a.8.8 90 000 16 .8.8 90 000-16"/>
    <path fill="#dddddd" stroke="none" d="m4 9h.2a3.2 3.2 90 01-.1-.7.8.8 90 016.5-.1 1.9 1.9 90 013.1 2l.5-.1a.8.8 90 01.2 4.8h-10.5a.8.8 90 01.1-5.9"/>
  </svg>,
  // Облачно (clouds < 60%)
  <svg width='100%' viewBox="0 0 23 23">
    <path fill="#f15d46" stroke="none" d="m16 1a1 1 0 000 12 1 1 0 000-12"></path>
    <path fill="#dddddd" stroke="none" d="m4 9h.5a4.3 4.3 90 01-.1-.9 1 1 0 018.6-.1 2.5 2.5 0 014.1 2.7l.6-.1a1 1 0 01.3 6.4h-14a1 1 0 010-8"></path>
  </svg>,
  // Пасмурно
  <svg width='100%' viewBox="0 0 23 23">
    <path fill="#aaaaaa" stroke="none" d="m8 6h.4a3.44 3.44 90 01-.08-.72.8.8 90 016.88-.08 2 2 90 013.28 2.16l.48-.08a.8.8 90 01.24 5.12h-11.2a.8.8 90 010-6.4"></path>
    <path fill="#dddddd" stroke="none" d="m4 9h.4a3.44 3.44 90 01-.08-.72.8.8 90 016.88-.08 2 2 90 013.28 2.16l.48-.08a.8.8 90 01.24 5.12h-11.2a.8.8 90 010-6.4"></path>
  </svg>,
];
