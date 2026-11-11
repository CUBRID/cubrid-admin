#!/bin/sh
# Upgrades from test builds that installed to "/opt/CUBRID Admin": remove its now empty folders only.
[ -d "/opt/CUBRID Admin" ] && find "/opt/CUBRID Admin" -depth -type d -empty -delete 2>/dev/null || :
