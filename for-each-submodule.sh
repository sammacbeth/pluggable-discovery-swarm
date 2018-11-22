#!/bin/bash

echo $*
WD=`pwd`
for DIR in "core" "web" "node" "webext" "test"
do
    echo "Enter $DIR"
    cd $WD/$DIR
    $*
done
