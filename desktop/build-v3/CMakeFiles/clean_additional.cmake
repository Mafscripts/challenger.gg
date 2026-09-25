# Additional clean files
cmake_minimum_required(VERSION 3.16)

if("${CONFIG}" STREQUAL "" OR "${CONFIG}" STREQUAL "Release")
  file(REMOVE_RECURSE
  "CMakeFiles\\Topfragg_autogen.dir\\AutogenUsed.txt"
  "CMakeFiles\\Topfragg_autogen.dir\\ParseCache.txt"
  "Topfragg_autogen"
  )
endif()
