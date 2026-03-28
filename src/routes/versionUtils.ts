// Version comparison and reading helpers

export function compareVersions(version1: string, version2: string): number {
    // Liquid Reminders changelog style: v123 (integer only after v)
    if (/^v\d+$/.test(version1) && /^v\d+$/.test(version2)) {
        const num1 = parseInt(version1.substring(1), 10);
        const num2 = parseInt(version2.substring(1), 10);
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
        return 0;
    }

    const norm = (v: string) => v.replace(/^v/i, '').trim();
    const v1 = norm(version1);
    const v2 = norm(version2);
    if (v1 === v2) return 0;

    // Strict semver X.Y.Z (e.g. NS Raid Tools tags)
    const semverOnly = /^\d+\.\d+\.\d+$/;
    if (semverOnly.test(v1) && semverOnly.test(v2)) {
        const parseVersion = (version: string) => version.split('.').map(Number);
        const [major1, minor1, patch1] = parseVersion(v1);
        const [major2, minor2, patch2] = parseVersion(v2);
        if (major1 !== major2) return major1 > major2 ? 1 : -1;
        if (minor1 !== minor2) return minor1 > minor2 ? 1 : -1;
        if (patch1 !== patch2) return patch1 > patch2 ? 1 : -1;
        return 0;
    }

    // Tags with suffixes (e.g. M33kAuras 5.20.7-rg4-m51) — avoid NaN from split('.').map(Number)
    return v1.localeCompare(v2, undefined, { numeric: true, sensitivity: 'base' });
}

export function extractVersionFromToc(tocContent: string): string | false {
    const versionMatch = tocContent.match(/## Version:\s*(\S+)/);
    return versionMatch ? versionMatch[1] : false;
}

export function extractVersionFromChangelog(changelogContent: string): string | false {
    const versionMatch = changelogContent.match(/## \[(v\d+)\]/);
    return versionMatch ? versionMatch[1] : false;
}
