// Version comparison and reading helpers

export function compareVersions(version1: string, version2: string): number {
    // Handle LiquidReminders format (v123)
    if (version1.startsWith('v') && version2.startsWith('v')) {
        const num1 = parseInt(version1.substring(1));
        const num2 = parseInt(version2.substring(1));
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
        return 0;
    }

    // Handle semver format (1.2.3)
    const parseVersion = (version: string) => version.split('.').map(Number);
    const [major1, minor1, patch1] = parseVersion(version1);
    const [major2, minor2, patch2] = parseVersion(version2);
    if (major1 !== major2) return major1 > major2 ? 1 : -1;
    if (minor1 !== minor2) return minor1 > minor2 ? 1 : -1;
    if (patch1 !== patch2) return patch1 > patch2 ? 1 : -1;
    return 0;
}

export function extractVersionFromToc(tocContent: string): string | false {
    const versionMatch = tocContent.match(/## Version:\s*(\S+)/);
    return versionMatch ? versionMatch[1] : false;
}

export function extractVersionFromChangelog(changelogContent: string): string | false {
    const versionMatch = changelogContent.match(/## \[(v\d+)\]/);
    return versionMatch ? versionMatch[1] : false;
}
