# Releasing

Publishing to npm is driven by GitHub releases: create a release tagged
`vX.Y.Z` and the [release workflow](.github/workflows/release.yml) validates
it and publishes `@lightninglabs/wavelength-bare-addon` and
`@lightninglabs/wdk-wallet-wavelength`. There is nothing to run locally and no
npm credentials to hold.

## Versioning

Both packages share one version, and that version is the daemon release they
are paired with. The pairing comes from `@lightninglabs/wavelength-core`: its
`RUNTIME_MANIFEST_VERSION` names the
[wavelength](https://github.com/lightninglabs/wavelength) release the daemon
binaries are downloaded from, and the SDK packages already version in
lockstep with it. So `wdk-wallet-wavelength` `0.2.0` runs against wavelength
`v0.2.0` and `wavelength-core` `0.2.0`, always.

Every daemon release needs a release here, even when the daemon API doesn't
change, because the binary checksums are pinned per release. A release starts
with a PR that moves the pins:

1. Set `@lightninglabs/wavelength-core` and
   `@lightninglabs/wavelength-react-native` to the new SDK version everywhere
   they appear in the packages' and examples' `package.json` files.
2. Add the new release's checksums to `wdk-wallet-wavelength/scripts/aar-checksums.json`,
   `wdk-wallet-wavelength/scripts/wasm-runtime-checksums.json`, and
   `wavelength-bare-addon/scripts/checksums.json`.
3. Set the `version` of both packages, and the examples' dependency on
   `@lightninglabs/wdk-wallet-wavelength`, to the same version (it drops the
   `v`, so daemon `v0.2.0` means version `0.2.0`).
4. Update the wrappers in `wdk-wallet-wavelength` and the bindings in
   `wavelength-bare-addon/binding.mm` for any daemon API changes.
5. Run `npm install` to refresh `package-lock.json`.

`wdk-wallet-wavelength/tests/version-pins.test.js` fails CI until the pins,
checksums, and package versions all agree.

### iOS prebuilds

The addon's prebuilds in `wavelength-bare-addon/prebuilds` are committed and
published as-is. They resolve the daemon's `Mobile*` functions when the app
loads, so nothing at build time catches a prebuild that is out of date with
the daemon. Rebuild them on a Mac with `wavelength-bare-addon/build.sh` (after
`npm install` has staged the xcframework) whenever `binding.mm` changes or a
daemon release changes the signature of a bound function, and commit the
result with the sync.

## Cutting a release

1. Land the PR that moves the pins and versions.
2. On [the releases page](https://github.com/lightninglabs/wavelength-wdk/releases),
   create a new release with a new tag `vX.Y.Z` matching the version, targeting
   `main`. Write the release notes; drafting first is fine, the workflow only
   runs when the release is published. For a prerelease version, check the
   "Set as a pre-release" box; the workflow fails if the box and the version
   disagree.
3. Publish the release. The workflow fires, checks that the tag, the daemon
   pin, and both package versions agree, and publishes to npm.
4. Confirm the run succeeded in the
   [Actions tab](https://github.com/lightninglabs/wavelength-wdk/actions/workflows/release.yml)
   and spot-check both packages on npm.

If the workflow fails at the version check, the release was cut before the
version PR landed (or the tag has a typo). Editing the release doesn't
re-trigger the workflow, and deleting it keeps the tag pointing at the old
commit, so delete both:

```sh
gh release delete vX.Y.Z --cleanup-tag
```

Then fix the mismatch and create and publish the release again. Re-running is
safe at any point; a version already on npm is skipped rather than
republished.

## How publishing authenticates

The workflow uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers):
npmjs.com trusts this repository's `release.yml` workflow directly via OIDC.
There is no `NPM_TOKEN` secret to rotate or leak, and every publish gets
provenance attestations for free (npm only generates them for public
repositories).

Each package carries this configuration on npmjs.com (package Settings >
Trusted Publisher: GitHub Actions, repository `lightninglabs/wavelength-wdk`,
workflow `release.yml`). Without it the publish step fails with an auth error.

## Prereleases

When the daemon ships an RC, lockstep versioning makes these packages a
prerelease too (daemon `v0.3.0-rc1` means version `0.3.0-rc1`). The workflow
derives the npm dist-tag from the version: a stable `x.y.z` lands on `latest`,
and a prerelease (any version with a hyphen) lands on `next`. A plain
`npm install` keeps resolving the last stable release; testers opt in with:

```sh
npm install @lightninglabs/wdk-wallet-wavelength@next
```

When the stable version ships, it lands on `latest` as usual and `next` just
falls behind until the next RC. Nothing needs cleaning up between cycles.
