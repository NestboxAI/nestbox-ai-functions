function formatLogs(type: 'log' | 'error' | 'warn' | 'info', args: any[]) {
    const timestamp = new Date().toISOString();
    const output = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg)).join(' ');
    return `[${timestamp}] ${type.toUpperCase()}: ${output}`;
}

console.log = (...args: any[]) => {
    process.stdout.write(formatLogs('log', args) + '\n');
};

console.error = (...args: any[]) => {
    process.stderr.write(formatLogs('error', args) + '\n');
};

console.warn = (...args: any[]) => {
    process.stdout.write(formatLogs('warn', args) + '\n');
};

console.info = (...args: any[]) => {
    process.stdout.write(formatLogs('info', args) + '\n');
};