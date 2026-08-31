/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './js/**/*.js'],
    theme: {
        extend: {}
    },
    safelist: [
        'hidden',
        'bg-green-100',
        'bg-red-100',
        'bg-gray-100',
        'bg-indigo-50',
        'bg-amber-50',
        'text-green-800',
        'text-red-800',
        'text-gray-800',
        'text-green-700',
        'text-red-700',
        'text-green-600',
        'text-red-600',
        'text-blue-600',
        'text-amber-700',
        'text-amber-800',
        'text-orange-600',
        'text-yellow-600',
        'border-4',
        'border-indigo-500',
        'ring-1',
        'ring-amber-400',
        'font-semibold',
        'w-0',
        'sr-only'
    ]
};
