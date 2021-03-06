#!/bin/bash

# This script is used to generate releases of the python taskcluster client in
# a uniform way and upload it to pypi.  It should be the only way that releases
# are created.

# Note that the VERSION in setup.py should be updated before release!

REPOSITORY_URL=https://test.pypi.org/legacy/
if [ "$1" = "--real" ]; then
    REPOSITORY_URL=https://pypi.org/legacy/
fi

# step into directory containing this script
cd "$(dirname "${0}")"

# exit in case of bad exit code
set -e

# Local changes will not be in the release, so they should be dealt with before
# continuing. git stash can help here! Untracked files can make it into release
# so let's make sure we have none of them either.
modified="$(git status --porcelain)"
if [ -n "$modified" ]; then
  echo "There are changes in the local tree.  This probably means"
  echo "you'll do something unintentional.  For safety's sake, please"
  echo 'revert or stash them!'
  exit 66
fi

# begin making the distribution
rm -f dist/*
rm -rf .release
mkdir -p .release

python3 -mvenv .release/py3
.release/py3/bin/pip install -U setuptools twine wheel
.release/py3/bin/python setup.py sdist
.release/py3/bin/python setup.py bdist_wheel

# Work around https://bitbucket.org/pypa/wheel/issues/147/bdist_wheel-should-start-by-cleaning-up
rm -rf build/

virtualenv --python=python2 .release/py2
.release/py2/bin/pip install -U setuptools wheel
.release/py2/bin/python setup.py bdist_wheel

ls -al dist

# Publish to PyPI using Twine, as recommended by:
# https://packaging.python.org/tutorials/distributing-packages/#uploading-your-project-to-pypi
.release/py3/bin/twine upload --repository-url $REPOSITORY_URL dist/*
